"use server";

import { headers } from "next/headers";
import type { SubmissionResult } from "@conform-to/react";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/lib/terms-consent-gate";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { assertOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
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
import { fetchReservationEmailData } from "@/shared/domain/reservations/payloads";
import {
  syncReservationToCalendar,
  updateCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
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
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
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
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);

    if (!(await isFeatureEnabled("payment"))) {
      return createMutationError(
        "オンライン決済は現在利用できません。管理者にお問い合わせください。",
      );
    }
    await assertOnlinePaymentAvailable();

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
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);

    // FEAT-3PLANE-02 (Codex #1433): 閲覧専用の detail ページは reservation
    // feature OFF でも到達可能にしたため (dead link 回避)、ページ側の
    // requireFeatureEnabled による fail-closed に頼れない。UI 側でボタンを
    // 隠す設計でも、action を直接叩かれるケースに備えて server 側でも
    // fail-closed する (cancelReservationSeriesCustomerAction の Settings gate
    // と同型パターン)。
    if (!(await isFeatureEnabled("reservation"))) {
      return createMutationError(
        "この機能は現在利用できません。管理者にお問い合わせください。",
      );
    }

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
      // UPDATE-ORDER-01 / SEC-MYPAGE-03:
      // 順序 SSoT (rules/forms-mutations.md) の
      // `checkActionRateLimit → validateTurnstile → session → customer →
      //  assertCustomerActive → mutation`
      // を厳守する。Turnstile 検証は DB / 外部 API を触らない最安のチェックなので、
      // session 取得 (Better Auth cookie parse + Customer 引き当て) より前に置き、
      // bot による認証済み経路 hitting を早期遮断する。
      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: "リクエストが多すぎます" };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.mypage_reservation_edit,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const session = await getCustomerSession();
      if (!session) {
        return { ok: false, error: "認証が必要です" };
      }

      const customer = await getCustomerByUserId(session.user.id);
      if (!customer) {
        return { ok: false, error: "顧客情報が見つかりません" };
      }

      try {
        await assertCustomerActive(customer.id);
        await assertLoginSignupReagreed(customer.id);

        // FEAT-3PLANE-02 (Codex #1433): edit ページ自体は requireFeatureEnabled
        // で 404 fail-closed 済みだが、Server Action は URL 到達性と独立に
        // 直接呼び出せるため、ここでも同じ gate を独立して掛ける
        // (cancelReservationAction と同型パターン)。
        if (!(await isFeatureEnabled("reservation"))) {
          return { ok: false, error: "この機能は現在利用できません。" };
        }
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
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

        // GCAL-OUTBOUND-01: 管理画面 updateReservationAction と同型パターン。
        // 顧客セルフ変更でも日時/スペース変更を GCal に反映する
        // (旧実装はこの経路だけ outbound sync が欠落していた)。
        // ReservationSyncData の組み立ては fetchReservationEmailData
        // (payloads.ts SSoT) を再利用し、独自フォーマッタを作らない。
        fireAndForget(
          (async () => {
            const payload = await fetchReservationEmailData(data.reservationId);
            if (!payload) return;
            const syncData: ReservationSyncData = omitUndefined(payload);
            if (result.payload.googleCalendarEventId) {
              await updateCalendarSync(
                syncData,
                result.payload.googleCalendarEventId,
              );
            } else {
              await syncReservationToCalendar(syncData);
            }
          })(),
          {
            operation: "customerUpdateReservationCalendarSync",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: data.reservationId },
          },
        );

        // PR#14: 変更前スナップショットと入力を比較し、spaceId or 時刻変更ありなら
        // SwitchBot passcode の revoke + reissue を実行し (tx 外)、発行失敗時のみ
        // fallback 案内を変更通知メールに載せる。平文はハブ開示
        // (Codex P1 対応 + PR#12 fallback pattern 準拠)。
        fireAndForget(
          (async () => {
            let smartLockIssuanceFailed = false;
            if (before) {
              const newStartTime = parseDateTimeLocalAsJst(
                `${data.date}T${data.startTime}`,
              );
              const newEndTime = parseDateTimeLocalAsJst(
                `${data.date}T${data.endTime}`,
              );
              const result = await applyReservationEditSideEffects({
                reservationId: data.reservationId,
                oldSpaceId: before.spaceId,
                oldStartTime: before.startTime,
                oldEndTime: before.endTime,
                newSpaceId: data.spaceId,
                newStartTime,
                newEndTime,
              });
              smartLockIssuanceFailed = result.issuanceFailed;
            }

            const payload = await fetchReservationEmailData(data.reservationId);
            if (!payload) return;
            const payloadData = omitUndefined({
              ...payload,
              ...(smartLockIssuanceFailed
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

        // SEC-MYPAGE-01: 顧客セルフ変更経路にも AuditLog を残す。
        // admin 経路は `executeAdminMutationResult` が自動書き込みするが、
        // customer 経路はラッパーが無いため自前で発火する
        // (cancellation-side-effects の AuditLog パターンと同型)。
        // AuditLog chain は append-only + hash-chain 契約のため
        // fireAndForget + catch 内 logError で送出して action 応答を
        // ブロックしない。before === null (該当予約が見つからなかった)
        // ケースは、その前段の updateCustomerReservation で既に error 応答
        // (success: false) を返しているため、ここに到達したら before は
        // 必ず存在する (defensive に oldValue を null で送るだけ)。
        const auditNewValue = {
          spaceId: data.spaceId,
          startTime: parseDateTimeLocalAsJst(
            `${data.date}T${data.startTime}`,
          ).toISOString(),
          endTime: parseDateTimeLocalAsJst(
            `${data.date}T${data.endTime}`,
          ).toISOString(),
        };
        const auditOldValue = before
          ? {
              spaceId: before.spaceId,
              startTime: before.startTime.toISOString(),
              endTime: before.endTime.toISOString(),
            }
          : null;
        const requestHeaders = await headers();
        const ip = await getClientIpFromHeaders();
        const userAgent = requestHeaders.get("user-agent");
        fireAndForget(
          createAuditLogRecord({
            userId: session.user.id,
            action: AuditAction.UPDATE,
            resource: "reservation",
            resourceId: data.reservationId,
            ...(auditOldValue ? { oldValue: auditOldValue } : {}),
            newValue: auditNewValue,
            metadata: {
              channel: "customer-mypage",
              ip,
              userAgent,
            },
          }).catch((error: unknown) => {
            logError(normalizeError(error), {
              category: ErrorCategory.DATABASE,
              severity: ErrorSeverity.HIGH,
              context: {
                operation: "auditLogCustomerReservationUpdate",
                reservationId: data.reservationId,
              },
            });
          }),
          {
            operation: "auditLogCustomerReservationUpdate",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.HIGH,
            context: { reservationId: data.reservationId },
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
