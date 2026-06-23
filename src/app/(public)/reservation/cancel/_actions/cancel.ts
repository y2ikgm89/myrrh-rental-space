"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import {
  verifyCancelToken,
  tokenFingerprint,
} from "@/shared/lib/reservation-cancel-token";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { cancelReservationByToken } from "@/shared/domain/reservations/customer-commands";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import { getReservationForGuestCancel } from "@/shared/domain/reservations/customer-queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  cancelByReservationRateLimiter,
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";

const CANCEL_TOKEN_COOKIE_NAME = "cancel-token";
const reservationIdSchema = z.uuid({ error: "予約IDが不正です" });
const reasonSchema = z
  .string()
  .trim()
  .max(500, { error: "キャンセル理由は 500 文字以内で入力してください" })
  .optional();

/**
 * ゲスト予約キャンセル（メールリンク経由）
 *
 * トークンは HttpOnly cookie (`cancel-token`) から読む。client から token を
 * 引き取らないため URL/ヘッダ/ログへの漏洩経路を構造的に遮断する。
 *
 * セキュリティ階層:
 *  1. IP rate-limit（formSubmitRateLimiter / 5 req/min/IP）
 *  2. Turnstile（bot 防御）
 *  3. cookie からトークン取り出し → 暗号検証
 *  4. **member-ownership ガード** — ログイン中ユーザーが別人の予約に作用するのを遮断
 *  5. **per-reservation rate-limit** (3 req/hour/reservationId) — 分散攻撃 / XFF spoof 対策
 *  6. cancelReservationByToken の atomic claim（status race を防ぐ）
 *  7. applyCancellationSideEffects（refund / GCal / メール / 通知 / 監査）
 */
export async function cancelGuestReservationAction(
  cancellationReason: string | null = null,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) {
    logError(new Error("Guest cancel rate-limit hit (form/IP)"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: { operation: "guestCancelAction", limiter: "formSubmit" },
    });
    return createMutationError("リクエストが多すぎます");
  }

  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.guest_reservation_cancel,
  });
  if (!turnstile.success) {
    logError(new Error("Guest cancel Turnstile failed"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "guestCancelAction",
        ip: await getClientIpFromHeaders(),
      },
    });
    return createMutationError(turnstile.error);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(CANCEL_TOKEN_COOKIE_NAME)?.value ?? null;
  if (!token) {
    return createMutationError("キャンセルリンクが無効または期限切れです");
  }

  const verified = verifyCancelToken(token, reservationDeadlineNow());
  if (!verified.valid) {
    logError(
      new Error(`Guest cancel token verify failed: ${verified.reason}`),
      {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "guestCancelAction",
          reason: verified.reason,
          ip: await getClientIpFromHeaders(),
          tokenFingerprint: tokenFingerprint(token),
        },
      },
    );
    return createMutationError("キャンセルリンクが無効または期限切れです");
  }

  // 予約 ID の defense-in-depth 検証（payload は authTag で保護済みだが、
  // UUID 形式チェックを別途行うことで予期せぬ payload で Prisma が generic エラーを
  // 返すパスを構造的に遮断）。
  const parsedId = reservationIdSchema.safeParse(verified.reservationId);
  if (!parsedId.success) return createMutationError("予約IDが不正です");

  const parsedReason = reasonSchema.safeParse(cancellationReason ?? undefined);
  if (!parsedReason.success) {
    return createMutationError(
      parsedReason.error.issues[0]?.message ?? "理由の形式が不正です",
    );
  }

  // 5. per-reservation rate-limit — 単一予約への分散攻撃を遮断
  const perReservation = await cancelByReservationRateLimiter.check(
    parsedId.data,
  );
  if (!perReservation.success) {
    logError(new Error("Guest cancel rate-limit hit (per-reservation)"), {
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "guestCancelAction",
        limiter: "perReservation",
        reservationId: parsedId.data,
        ip: await getClientIpFromHeaders(),
      },
    });
    return createMutationError(
      "この予約に対するキャンセル試行が多すぎます。しばらく時間をおいてからお試しください",
    );
  }

  // 4. member-ownership ガード: ログイン中ユーザーが「別人の予約」をキャンセル
  //    しようとしている場合は拒否。ゲスト本人（session 無し）はそのまま通す。
  const session = await getCustomerSession();
  const sessionUserId = session?.user.id ?? null;
  if (sessionUserId) {
    const reservation = await getReservationForGuestCancel(parsedId.data);
    if (!reservation) {
      return createMutationError("予約が見つかりません");
    }
    const customer = await getCustomerByUserId(sessionUserId);
    if (customer && customer.id !== reservation.customerId) {
      return createMutationError(
        "このリンクは別のお客様のご予約です。マイページからご自身のご予約をご確認ください",
      );
    }
  }

  try {
    const settings = await getReservationDeadlineSettings();
    const trimmedReason =
      parsedReason.data && parsedReason.data.length > 0
        ? parsedReason.data
        : null;

    const result = await cancelReservationByToken(
      parsedId.data,
      settings.cancellationDeadlineHours,
      trimmedReason,
    );
    if (!result.success) return createMutationError(result.error);

    invalidateReservationCaches(parsedId.data, null, {
      coupons: true,
    });

    // 副作用統一実行: refund / GCal / メール / 通知 / 監査ログ
    const requestHeaders = await headers();
    const ip = await getClientIpFromHeaders();
    const userAgent = requestHeaders.get("user-agent");

    await applyCancellationSideEffects({
      reservationId: parsedId.data,
      cancellationReason: trimmedReason,
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
