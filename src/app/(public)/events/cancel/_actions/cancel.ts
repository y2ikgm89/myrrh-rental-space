"use server";

import { cookies, headers } from "next/headers";
import {
  verifyCancelToken,
  tokenFingerprint,
} from "@/shared/lib/event-registration-cancel-token";
import { cancelEventRegistrationByToken } from "@/shared/domain/events/registration-commands";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import { getEventRegistrationForGuestCancel } from "@/shared/domain/events/registration-queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  cancelByEventRegistrationRateLimiter,
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";

const EVENT_CANCEL_TOKEN_COOKIE_NAME = "event-cancel-token";
const registrationIdSchema = prismaCuidIdSchema("イベント参加申込");

/**
 * ゲストイベント参加申込キャンセル（メールリンク経由）
 *
 * トークンは HttpOnly cookie (`event-cancel-token`) から読む。client から token を
 * 引き取らないため URL/ヘッダ/ログへの漏洩経路を構造的に遮断する
 * （reservation/cancel の `cancelGuestReservationAction` と同設計）。
 *
 * セキュリティ階層:
 *  1. IP rate-limit（formSubmitRateLimiter / 5 req/min/IP）
 *  2. Turnstile（bot 防御）
 *  3. cookie からトークン取り出し → 暗号検証
 *  4. per-registration rate-limit (3 req/hour/registrationId) — 分散攻撃 / XFF spoof 対策
 *  5. member-ownership ガード — ログイン中ユーザーが別人の申込に作用するのを遮断
 *  6. cancelEventRegistrationByToken の atomic claim（status race を防ぐ）
 *  7. applyEventRegistrationCancellationSideEffects（メール / 通知 / 監査）
 */
export async function cancelGuestEventRegistrationAction(
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) {
    logError(new Error("Guest event cancel rate-limit hit (form/IP)"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: { operation: "guestEventCancelAction", limiter: "formSubmit" },
    });
    return createMutationError("リクエストが多すぎます");
  }

  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.guest_event_registration_cancel,
  });
  if (!turnstile.success) {
    logError(new Error("Guest event cancel Turnstile failed"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "guestEventCancelAction",
        ip: await getClientIpFromHeaders(),
      },
    });
    return createMutationError(turnstile.error);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(EVENT_CANCEL_TOKEN_COOKIE_NAME)?.value ?? null;
  if (!token) {
    return createMutationError("キャンセルリンクが無効または期限切れです");
  }

  const verified = verifyCancelToken(token, new Date());
  if (!verified.valid) {
    logError(
      new Error(`Guest event cancel token verify failed: ${verified.reason}`),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "guestEventCancelAction",
          reason: verified.reason,
          ip: await getClientIpFromHeaders(),
          tokenFingerprint: tokenFingerprint(token),
        },
      },
    );
    return createMutationError("キャンセルリンクが無効または期限切れです");
  }

  // 申込 ID の defense-in-depth 検証（payload は authTag で保護済みだが、
  // cuid 形式チェックを別途行うことで予期せぬ payload で Prisma が generic エラーを
  // 返すパスを構造的に遮断）。
  const parsedId = registrationIdSchema.safeParse(verified.registrationId);
  if (!parsedId.success) return createMutationError("申込IDが不正です");

  // 4. per-registration rate-limit — 単一申込への分散攻撃を遮断
  const perRegistration = await cancelByEventRegistrationRateLimiter.check(
    parsedId.data,
  );
  if (!perRegistration.success) {
    logError(
      new Error("Guest event cancel rate-limit hit (per-registration)"),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "guestEventCancelAction",
          limiter: "perRegistration",
          registrationId: parsedId.data,
          ip: await getClientIpFromHeaders(),
        },
      },
    );
    return createMutationError(
      "この申込に対するキャンセル試行が多すぎます。しばらく時間をおいてからお試しください",
    );
  }

  // 5. member-ownership ガード: ログイン中ユーザーが「別人の申込」をキャンセル
  //    しようとしている場合は拒否。ゲスト本人（session 無し）はそのまま通す。
  const session = await getCustomerSession();
  const sessionUserId = session?.user.id ?? null;
  if (sessionUserId) {
    const registration = await getEventRegistrationForGuestCancel(
      parsedId.data,
    );
    if (!registration) {
      return createMutationError("申込が見つかりません");
    }
    const customer = await getCustomerByUserId(sessionUserId);
    if (customer && customer.id !== registration.customerId) {
      return createMutationError(
        "このリンクは別のお客様のご参加申込です。マイページからご自身の申込をご確認ください",
      );
    }
  }

  try {
    const result = await cancelEventRegistrationByToken(parsedId.data);

    invalidateEventCaches();

    // 副作用統一実行: メール / 通知 / 監査ログ
    const requestHeaders = await headers();
    const ip = await getClientIpFromHeaders();
    const userAgent = requestHeaders.get("user-agent");

    await applyEventRegistrationCancellationSideEffects({
      registrationId: result.id,
      channel: "customer-token",
      actorUserId: sessionUserId,
      request: { ip, userAgent, tokenFingerprint: tokenFingerprint(token) },
    });

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
