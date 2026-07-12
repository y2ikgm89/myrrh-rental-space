"use server";

import { headers } from "next/headers";
import type { SubmissionResult } from "@conform-to/react";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import {
  cancelCustomerReservation,
  updateCustomerReservation,
} from "@/shared/domain/reservations/customer-commands";
import { createCheckoutSessionCommand } from "@/shared/domain/reservations/payment-commands";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import {
  applyReservationEditSideEffects,
  getReservationSnapshotForEdit,
} from "@/shared/domain/reservations/edit-side-effects";
import {
  buildDateTime,
  fetchReservationEmailData,
} from "@/shared/domain/reservations/payloads";
import {
  sendReservationAdminNotification,
  sendReservationUpdatedEmail,
} from "@/shared/lib/email/reservation-emails";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { customerReservationEditSchema } from "@/shared/lib/validations/customer-reservation";
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
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { DomainError } from "@/shared/domain/domain-error";
import { fireAndForget } from "@/shared/lib/async-utils";
import { omitUndefined } from "@/shared/lib/serialize";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import { z } from "zod";

const reservationIdSchema = z.uuid({ error: "予約IDが不正です" });

/**
 * 公開マイページから Stripe Checkout Session を開始する (PR#7)。
 *
 * `createCheckoutSessionCommand` に `actorCustomerId` として Better Auth 認証済み
 * Customer.id を渡し、IDOR (他人の予約 id で checkout 作成) を封鎖する (PR#6 参照)。
 *
 * @returns Stripe Checkout Session の URL (成功時は呼出元で `redirect` する)。
 */
export async function startCheckoutSessionAction(
  reservationId: string,
): Promise<MutationResult<{ sessionUrl: string | null }>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) return createMutationError("予約IDが不正です");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  try {
    const result = await createCheckoutSessionCommand({
      reservationId: parsedId.data,
      actorCustomerId: customer.id,
    });
    invalidateReservationCaches(parsedId.data, customer.id);
    return { sessionUrl: result.sessionUrl };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}

export async function cancelReservationAction(
  reservationId: string,
  cancellationReason: string | null = null,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.mypage_reservation_cancel,
  });
  if (!turnstile.success) return createMutationError(turnstile.error);

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) return createMutationError("予約IDが不正です");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  try {
    const settings = await getReservationDeadlineSettings();
    const trimmedReason =
      cancellationReason && cancellationReason.trim().length > 0
        ? cancellationReason.trim()
        : null;
    const result = await cancelCustomerReservation(
      parsedId.data,
      customer.id,
      settings.cancellationDeadlineHours,
      trimmedReason,
    );

    if (!result.success) return createMutationError(result.error);

    invalidateReservationCaches(parsedId.data, customer.id, {
      coupons: true,
    });

    // 副作用統一実行: refund / GCal / メール / 通知 / 監査ログ
    const requestHeaders = await headers();
    const ip = await getClientIpFromHeaders();
    const userAgent = requestHeaders.get("user-agent");

    await applyCancellationSideEffects({
      reservationId: parsedId.data,
      cancellationReason: trimmedReason,
      channel: "customer-mypage",
      actorUserId: session.user.id,
      request: { ip, userAgent, tokenFingerprint: null },
    });

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}

export async function updateReservationAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    customerReservationEditSchema,
    async (data) => {
      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: "リクエストが多すぎます" };
      }

      const session = await getCustomerSession();
      if (!session) {
        return { ok: false, error: "認証が必要です" };
      }

      const customer = await getCustomerByUserId(session.user.id);
      if (!customer) {
        return { ok: false, error: "顧客情報が見つかりません" };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.mypage_reservation_edit,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      try {
        // PR#14: 変更 side-effect (SwitchBot 再発行) のため、変更前スナップショットを
        // update の直前に取得する。startTime/endTime の変更判定に必要。
        const before = await getReservationSnapshotForEdit(
          data.reservationId,
          customer.id,
        );

        const settings = await getReservationDeadlineSettings();
        const result = await updateCustomerReservation(
          data.reservationId,
          customer.id,
          data,
          settings.modificationDeadlineHours,
        );

        if (!result.success) {
          return { ok: false, error: result.error };
        }

        invalidateReservationCaches(data.reservationId, customer.id, {
          coupons: true,
        });

        // PR#14: 変更前スナップショットと入力を比較し、spaceId or 時刻変更ありなら
        // SwitchBot passcode の revoke + reissue を実行し (tx 外)、新パスコード
        // または発行失敗フラグを顧客への変更通知メールに含めて送信する
        // (Codex P1 対応 + PR#12 fallback pattern 準拠)。
        //
        // side-effects → email を 1 つの fireAndForget で直列化することで、
        // 発行された新パスコード / 失敗時 fallback 案内が update email に載る動線を
        // 確保する。何も変更なしなら { passcodes: [], issuanceFailed: false } が返り、
        // update email は smart-lock セクション無しで通常送信される。
        fireAndForget(
          (async () => {
            let smartLockResult: {
              passcodes: { deviceName: string; passcode: string }[];
              issuanceFailed: boolean;
            } = { passcodes: [], issuanceFailed: false };
            if (before) {
              const newStartTime = buildDateTime(data.date, data.startTime);
              const newEndTime = buildDateTime(data.date, data.endTime);
              const result = await applyReservationEditSideEffects({
                reservationId: data.reservationId,
                oldSpaceId: before.spaceId,
                oldStartTime: before.startTime,
                oldEndTime: before.endTime,
                newSpaceId: data.spaceId,
                newStartTime,
                newEndTime,
              });
              smartLockResult = {
                passcodes: [...result.passcodes],
                issuanceFailed: result.issuanceFailed,
              };
            }

            const payload = await fetchReservationEmailData(data.reservationId);
            if (!payload) return;
            const payloadData = omitUndefined({
              ...payload,
              ...(smartLockResult.passcodes.length > 0
                ? { smartLockPasscodes: smartLockResult.passcodes }
                : {}),
              ...(smartLockResult.issuanceFailed
                ? { smartLockIssuanceFailed: true }
                : {}),
            });
            await Promise.all([
              sendReservationUpdatedEmail(payloadData),
              sendReservationAdminNotification(payloadData, "update"),
            ]);
          })(),
          {
            operation: "sendReservationUpdateNotification",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: data.reservationId },
          },
        );

        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.RESERVATION_UPDATE,
            title:
              NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_UPDATE],
            message: `${customer.lastName}${customer.firstName}様が予約を変更しました`,
            resourceType: "reservation",
            resourceId: data.reservationId,
          }),
          {
            operation: "createCustomerUpdateNotification",
            category: ErrorCategory.DATABASE,
          },
        );

        return { ok: true };
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  );
}
