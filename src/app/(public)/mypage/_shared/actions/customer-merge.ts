"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  consumeCustomerMergeTokenCommand,
  findUnlinkedGuestCustomerForMember,
  getCustomerMergePreviewForGuest,
  requestCustomerMergeCommand,
} from "@/shared/domain/customers/customer-merge-commands";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { sendCustomerMergeVerificationEmail } from "@/shared/domain/email/lib-dispatch";
import { assertLoginSignupReagreed } from "@/shared/domain/terms/consent-gate";
import { getAccountProviders } from "@/shared/domain/users/queries";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import {
  checkActionRateLimit,
  checkEmailRateLimit,
} from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  CUSTOMER_TRUSTED_PROVIDERS,
  getCustomerSession,
} from "@/shared/lib/customer-auth";
import { CACHE_TAGS, getAppUrl, getCacheTag } from "@/shared/lib/constants";
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  emailVerificationByEmailRateLimiter,
  emailVerificationRequestRateLimiter,
  formSubmitRateLimiter,
} from "@/shared/lib/rate-limit";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import {
  classifyCustomerMergeConfirmError,
  MERGE_SUCCESS_QUERY_KEY,
  MERGE_SUCCESS_SENTINEL,
} from "@/app/(public)/mypage/_shared/merge-query";

const MERGE_VERIFICATION_SENT_MESSAGE =
  "確認メールを送信しました。メールに記載された URL をクリックして統合を完了してください。";

function hasTrustedEmailProvider(providers: readonly string[]): boolean {
  return CUSTOMER_TRUSTED_PROVIDERS.some((provider) =>
    providers.includes(provider),
  );
}

export async function requestCustomerMergeAction(): Promise<
  MutationResult<{ successMessage: string }>
> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const providers = await getAccountProviders(session.user.id);
  if (!hasTrustedEmailProvider(providers)) {
    return createMutationError(
      "履歴の自己統合は、メールアドレスが検証済みの Google ログインでのみ利用できます。",
    );
  }

  const { customer } = await ensureCustomerLinked(session.user);

  try {
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }

  if (!customer.email) {
    return createMutationError("メールアドレスが登録されていません");
  }

  const guest = await findUnlinkedGuestCustomerForMember({
    memberCustomerId: customer.id,
    email: customer.email,
  });
  if (!guest) {
    return createMutationError("統合対象のゲスト履歴が見つかりません");
  }

  const ipLimit = await checkActionRateLimit(
    emailVerificationRequestRateLimiter,
  );
  if (!ipLimit.success) {
    return createMutationError(
      "確認メールの送信回数が上限に達しました。しばらく経ってから再度お試しください。",
    );
  }

  const emailLimit = await checkEmailRateLimit(
    emailVerificationByEmailRateLimiter,
    guest.email,
  );
  if (!emailLimit.success) {
    return createMutationError(
      "確認メールの送信回数が上限に達しました。しばらく経ってから再度お試しください。",
    );
  }

  try {
    const preview = await getCustomerMergePreviewForGuest(guest.id);
    const request = await requestCustomerMergeCommand(customer.id, guest.id);

    const verificationUrl = new URL("/mypage/merge/confirm", getAppUrl());
    verificationUrl.searchParams.set("token", request.rawToken);

    const emailResult = await sendCustomerMergeVerificationEmail({
      email: guest.email,
      name: `${customer.lastName} ${customer.firstName}`.trim(),
      guestEmail: guest.email,
      verificationUrl: verificationUrl.toString(),
      reservationCount: preview.reservationCount,
      inquiryCount: preview.inquiryCount,
      reviewCount: preview.reviewCount,
      registrationCount: preview.registrationCount,
    });

    if (!emailResult.ok) {
      return createMutationError("確認メールの送信に失敗しました");
    }

    return { successMessage: MERGE_VERIFICATION_SENT_MESSAGE };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "requestCustomerMerge",
        userId: session.user.id,
      },
    });
    return createMutationError("確認メールの送信に失敗しました");
  }
}

export async function confirmCustomerMergeAction(
  formData: FormData,
): Promise<void> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) {
    const rawRateLimitToken = formData.get("token");
    const rateLimitToken =
      typeof rawRateLimitToken === "string" ? rawRateLimitToken : "";
    redirect(
      toAppRoute(
        `/mypage/merge/confirm?error=rate_limit&token=${encodeURIComponent(rateLimitToken)}`,
      ),
    );
  }

  const session = await getCustomerSession();
  if (!session) {
    redirect("/login?returnTo=/mypage/merge/confirm");
  }

  const rawToken = formData.get("token");
  const token = typeof rawToken === "string" ? rawToken : "";
  if (token.length === 0) {
    redirect(toAppRoute("/mypage/merge/confirm?error=invalid"));
  }

  const { customer } = await ensureCustomerLinked(session.user);

  try {
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);
  } catch (error) {
    if (error instanceof DomainError) {
      redirectMergeConfirmError(error, token);
    }
    throw error;
  }

  try {
    const merged = await consumeCustomerMergeTokenCommand(token, customer.id);

    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(getCacheTag.customers.detail(merged.sourceCustomerId));
    updateTag(getCacheTag.customers.detail(merged.targetCustomerId));
    updateTag(CACHE_TAGS.RESERVATIONS);
    updateTag(CACHE_TAGS.INQUIRIES);
    updateTag(CACHE_TAGS.REVIEWS);
    updateTag(CACHE_TAGS.SUPPRESSED_EMAILS);
    invalidateSiteWideCache(CACHE_TAGS.EVENTS);

    fireAndForget(
      (async () => {
        const request = await buildAuditRequestContext();
        await createAuditLogRecord({
          userId: session.user.id,
          action: AuditAction.UPDATE,
          resource: "customer.merge",
          resourceId: merged.sourceCustomerId,
          newValue: {
            targetId: merged.targetCustomerId,
            transferredReservations: merged.transferredReservations,
            transferredInquiries: merged.transferredInquiries,
            transferredReviews: merged.transferredReviews,
            transferredRegistrations: merged.transferredRegistrations,
            preservedSuppression: merged.preservedSuppression,
          },
          metadata: {
            channel: "customer-mypage",
            ip: request.ip,
            userAgent: request.userAgent,
          },
        });
      })(),
      {
        operation: "auditLogCustomerMerge",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
      },
    );

    redirect(
      toAppRoute(
        `/mypage?${MERGE_SUCCESS_QUERY_KEY}=${MERGE_SUCCESS_SENTINEL}`,
      ),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      redirectMergeConfirmError(error, token);
    }
    throw error;
  }
}

function redirectMergeConfirmError(error: DomainError, token: string): never {
  const sentinel = classifyCustomerMergeConfirmError(error);
  redirect(
    toAppRoute(
      `/mypage/merge/confirm?error=${sentinel}&token=${encodeURIComponent(token)}`,
    ),
  );
}
