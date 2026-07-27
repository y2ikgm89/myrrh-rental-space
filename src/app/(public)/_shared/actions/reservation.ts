"use server";

import { z } from "zod";
import type { SubmissionResult } from "@conform-to/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
import {
  checkActionRateLimit,
  checkBotHeuristics,
  checkEmailRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  getClientIpFromHeaders,
  publicQueryRateLimiter,
  reservationByEmailRateLimiter,
  reservationSubmitRateLimiter,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createPublicReservationCommand } from "@/shared/domain/reservations/public-commands";
import { previewReservationPricing } from "@/shared/domain/reservations/pricing-preview";
import type { ReservationPricingResult } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { applyConfirmationSideEffects } from "@/shared/domain/reservations/confirmation-side-effects";
import { sendReservationAdminNotification } from "@/shared/domain/email/lib-dispatch";
import { syncReservationToCalendar } from "@/shared/domain/reservations/reservation-calendar-outbound";
import { fireAndForget } from "@/shared/lib/async-utils";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  assertAllRequiredTermsAgreed,
  assertLoginSignupReagreed,
} from "@/shared/lib/terms-consent-gate";
import {
  AuditAction,
  TermsScope,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { verifySpaceBelongsToLocation } from "@/shared/domain/spaces/public-queries";
import { resolveOptionalCustomerSession } from "@/shared/lib/customer-auth/gates";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { createCompleteToken } from "@/shared/lib/reservation-complete-token";
import { MS_PER_DAY } from "@/shared/lib/date-format";
import { checkPublicSiteWritable } from "@/shared/lib/maintenance-guard";

const COMPLETE_TOKEN_TTL_MS = MS_PER_DAY;

export async function submitReservation(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let completeToken: string | null = null;
  let succeeded = false;

  const submissionResult = await executeConformMutation(
    formData,
    publicReservationSchema,
    async (data) => {
      const maintenance = await checkPublicSiteWritable();
      if (!maintenance.ok) {
        return { ok: false, error: maintenance.error };
      }

      const rateLimit = await checkActionRateLimit(
        reservationSubmitRateLimiter,
      );
      if (!rateLimit.success) {
        return { ok: false, error: rateLimit.error };
      }

      const emailRateLimit = await checkEmailRateLimit(
        reservationByEmailRateLimiter,
        data.email,
      );
      if (!emailRateLimit.success) {
        return { ok: false, error: emailRateLimit.error };
      }

      const botCheck = checkBotHeuristics({
        honeypot: data.website,
        formRenderedAt: data.formRenderedAt,
      });
      if (!botCheck.success) {
        return { ok: false, error: botCheck.error };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.reservation,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const belongsToLocation = await verifySpaceBelongsToLocation(
        data.spaceId,
        data.locationId,
      );
      if (!belongsToLocation) {
        return {
          ok: false,
          error: "選択されたスペースは指定された場所に属していません",
        };
      }

      // Server-side consent gate — client gate のみは curl bypass 可能なので
      // ここで必須規約への同意を強制確認する。不足時は DomainError(VALIDATION)。
      try {
        await assertAllRequiredTermsAgreed({
          scope: TermsScope.RESERVATION,
          agreedTermsIds: data.agreedTermsIds,
        });
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "規約への同意が必要です",
        };
      }

      const user = await resolveOptionalCustomerSession();

      // OAUTH-BETTER-AUTH-01: 認証済みセッションで解決した Customer は
      // isActive / status BLACKLIST を Server Action 側で強制する
      // （domain 層の ensureCustomerNotBlacklisted は BLACKLIST のみ）。
      // 未ログインゲストは従来通り domain 層 guard に委ねる。
      if (user) {
        const authedCustomer = await getCustomerByUserId(user.id);
        if (authedCustomer) {
          try {
            await assertCustomerActive(authedCustomer.id);
            await assertLoginSignupReagreed(authedCustomer.id);
          } catch (error) {
            if (error instanceof DomainError) {
              return { ok: false, error: error.message };
            }
            throw error;
          }
        }
      }

      const clientIp = await getClientIpFromHeaders();
      const headersList = await headers();
      const userAgent = headersList.get("user-agent");

      try {
        // TermsAgreement は createPublicReservationCommand 内の同一 tx で記録する
        // （予約成立と法務 evidence の atomicity。series 経路と同契約）。
        const result = await createPublicReservationCommand({
          ...data,
          userId: user?.id,
          agreedTermsIds: data.agreedTermsIds,
          ipAddress: clientIp,
          userAgent: userAgent ?? null,
        });

        invalidateReservationCaches(result.id, result.customerId ?? null, {
          coupons: true,
        });

        const payload = omitUndefined(result.payload);
        fireAndForget(sendReservationAdminNotification(payload, "new"), {
          operation: "sendReservationAdminNotification",
          category: ErrorCategory.EXTERNAL_API,
        });

        fireAndForget(
          applyConfirmationSideEffects({
            payload,
            spaceId: data.spaceId,
            channel: "customer",
          }),
          {
            operation: "applyConfirmationSideEffects",
            category: ErrorCategory.EXTERNAL_API,
          },
        );

        // 公開予約は作成時点で CONFIRMED のため、ここで Google Calendar に同期する。
        // 連携が無効・未接続なら syncReservationToCalendar 内で no-op になる。
        fireAndForget(syncReservationToCalendar(payload), {
          operation: "syncReservationToCalendar",
          category: ErrorCategory.EXTERNAL_API,
        });

        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.RESERVATION_NEW,
            title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_NEW],
            message: `${result.payload.customerName}様が${result.payload.spaceName}を予約しました`,
            resourceType: "reservation",
            resourceId: result.id,
          }),
          {
            operation: "createReservationNotification",
            category: ErrorCategory.DATABASE,
          },
        );

        // D7: 公開予約 CREATE の最小監査。Customer は User FK ではないため
        // userId は付けず、customerId / channel を metadata に残す。
        fireAndForget(
          createAuditLogRecord({
            action: AuditAction.CREATE,
            resource: "reservation",
            resourceId: result.id,
            newValue: { status: "CONFIRMED" },
            metadata: {
              channel: "public",
              customerId: result.customerId,
            },
          }),
          {
            operation: "auditPublicReservationCreate",
            category: ErrorCategory.DATABASE,
          },
        );

        // 完了ページ用トークン（任意）。失敗しても予約成立は損なわず、トークン無しの
        // 汎用完了表示にフォールバックする。
        try {
          completeToken = createCompleteToken(
            result.id,
            new Date(Date.now() + COMPLETE_TOKEN_TTL_MS),
          );
        } catch (tokenError) {
          logError(normalizeError(tokenError), {
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.LOW,
            context: {
              operation: "createReservationCompleteToken",
              reservationId: result.id,
            },
          });
        }

        succeeded = true;
        return { ok: true };
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  );

  // 成功時は PRG で完了ページへ遷移（GET 副作用なし・リロード安全）。
  if (succeeded) {
    redirect(
      completeToken
        ? `/reservation/complete?token=${completeToken}`
        : "/reservation/complete",
    );
  }

  return submissionResult;
}

const pricingPreviewSchema = z.object({
  spaceId: z.uuid(),
  startDateTime: z.iso.datetime(),
  endDateTime: z.iso.datetime(),
  couponCode: z.string().max(20).optional(),
});

/**
 * 公開予約フォームの料金プレビュー。rate plan・スペース固有割引・長時間割引・税額の
 * 確定値は `calculateReservationPricing`（Task 7 SSoT）だけが知っている。client
 * component は Prisma に触れられないため、日時とスペース ID を渡すだけの Server
 * Action として公開する。無効なクーポンコードはプレビューから除外し、適用可否は
 * 送信時にサーバー側で確定する。
 *
 * 無効な入力・レート制限超過・対象スペースなしはすべて `null` を返す
 * （フォーム側は「まだ計算できない」として扱えばよく、専用のエラー UI は持たない）。
 */
export async function fetchReservationPricingPreview(
  spaceId: string,
  startDateTime: string,
  endDateTime: string,
  couponCode?: string | null,
): Promise<ReservationPricingResult | null> {
  const rateLimit = await checkActionRateLimit(publicQueryRateLimiter);
  if (!rateLimit.success) return null;

  const parsed = pricingPreviewSchema.safeParse({
    spaceId,
    startDateTime,
    endDateTime,
    ...(couponCode ? { couponCode } : {}),
  });
  if (!parsed.success) return null;

  return previewReservationPricing(
    {
      spaceId: parsed.data.spaceId,
      startDateTime: new Date(parsed.data.startDateTime),
      endDateTime: new Date(parsed.data.endDateTime),
      ...(parsed.data.couponCode ? { couponCode: parsed.data.couponCode } : {}),
    },
    { requirePublished: true },
  );
}
