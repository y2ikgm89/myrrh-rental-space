"use server";

import { verifyCancelToken } from "@/shared/lib/reservation-cancel-token";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { cancelReservationByToken } from "@/shared/domain/reservations/customer-commands";
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
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { DomainError } from "@/shared/domain/domain-error";
import { fireAndForget } from "@/shared/lib/async-utils";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import { ErrorCategory } from "@/shared/lib/errors/server";

/**
 * ゲスト予約キャンセル（メールリンク経由）
 *
 * 確認メールのキャンセルリンク先（確認ページ）から、ユーザーが確定操作を行ったときに
 * 呼ばれる。会員の {@link cancelReservationAction} と検証順序・helper を揃え、認証部分のみ
 * セッションから「検証済みトークン」に置き換える。GET では呼ばれず POST 確定でのみ実行する。
 */
export async function cancelGuestReservationAction(
  token: string,
  cancellationReason: string | null = null,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.guest_reservation_cancel,
  });
  if (!turnstile.success) return createMutationError(turnstile.error);

  const verified = verifyCancelToken(token, reservationDeadlineNow());
  if (!verified.valid) {
    return createMutationError(
      verified.reason === "expired"
        ? "キャンセルリンクの有効期限が切れています"
        : "キャンセルリンクが無効です",
    );
  }

  try {
    const settings = await getReservationDeadlineSettings();
    const trimmedReason =
      cancellationReason && cancellationReason.trim().length > 0
        ? cancellationReason.trim()
        : null;

    const result = await cancelReservationByToken(
      verified.reservationId,
      settings.cancellationDeadlineHours,
      trimmedReason,
    );
    if (!result.success) return createMutationError(result.error);

    invalidateReservationCaches(verified.reservationId, null, {
      coupons: true,
      notifications: true,
    });

    // 管理者向け in-app 通知（fire-and-forget）— 会員セルフキャンセルと同方針
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.RESERVATION_CANCEL,
        title: "顧客による予約キャンセル",
        message: "予約がメールリンクからキャンセルされました",
        resourceType: "reservation",
        resourceId: verified.reservationId,
      }),
      {
        operation: "createGuestCancelNotification",
        category: ErrorCategory.DATABASE,
      },
    );

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
