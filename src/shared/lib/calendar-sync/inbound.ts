/**
 * カレンダー→予約（双方向同期）
 *
 * カレンダー側での変更を予約システムに反映。
 * ポーリングまたはWebhookで変更検知。
 * 競合時は既存予約を優先（変更拒否）。
 *
 * @module shared/lib/calendar-sync/inbound
 */

import "server-only";
import {
  applyCalendarTimeChange,
  cancelReservationFromCalendar,
  GCAL_DELETE_CANCELLATION_REASON,
  getCalendarSyncRuntimeState,
  getReservationByCalendarEventId,
  recordCalendarSyncCompleted,
  saveCalendarSyncToken,
} from "@/shared/domain/reservations/calendar-sync";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  fetchCalendarChanges,
  type CalendarChange,
} from "@/shared/lib/google-calendar";
import { sendCalendarSyncRejectionEmail } from "@/shared/lib/email/system-emails";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { TwoWaySyncResult } from "./types";

/**
 * 時間変更を silent に適用してはいけない決済状態（GCAL-AUDIT-11）。
 * 決済が確定 / 保留中の予約は金額・返金判断を伴うため、GCal 側の時間変更を
 * 重複と同様に拒否し、管理者にメール通知して手動対応を促す。UNPAID のみ
 * `applyCalendarTimeChange` 経由で即時反映を許可する。
 */
const PAYMENT_STATUSES_BLOCKING_TIME_CHANGE: readonly PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.PENDING,
];

// 同期の最小間隔（秒）- 連続呼び出しを防ぐ
const SYNC_MIN_INTERVAL_SECONDS = 10;

/**
 * カレンダーからの変更を予約システムに同期
 *
 * ポーリングまたはWebhook受信時に呼び出される
 * 楽観的ロック: 最終同期時刻をチェックして連続実行を防止
 */
export async function syncFromCalendar(): Promise<TwoWaySyncResult> {
  const result: TwoWaySyncResult = {
    success: true,
    processed: 0,
    deleted: 0,
    updated: 0,
    errors: [],
  };

  try {
    const settings = await getCalendarSyncRuntimeState();

    if (settings.lastSyncedAt) {
      const lastSyncedAt = settings.lastSyncedAt.getTime();
      const now = Date.now();
      if (now - lastSyncedAt < SYNC_MIN_INTERVAL_SECONDS * 1000) {
        return { ...result, success: true };
      }
    }

    if (!settings.twoWaySyncEnabled) {
      return { ...result, success: true };
    }

    // GCAL-AUDIT-09: `recordCalendarSyncCompleted` (lastSyncedAt 更新) は本関数の
    // 冒頭ではなく、全変更処理が成功した後 (下記) にのみ呼ぶ。開始時点で
    // スタンプすると fetch/処理が失敗した場合でも throttle 判定
    // (`SYNC_MIN_INTERVAL_SECONDS`) が失敗直後の即時リトライをブロックしていた。

    // カレンダーの変更を取得
    const changesResult = await fetchCalendarChanges(settings.syncToken);
    if (!changesResult.success) {
      return {
        ...result,
        success: false,
        errors: [changesResult.error || "Failed to fetch changes"],
      };
    }

    // 変更を処理
    for (const change of changesResult.changes) {
      try {
        const processResult = await processCalendarChange(change);
        result.processed++;
        if (processResult.action === "deleted") {
          result.deleted++;
        } else if (processResult.action === "updated") {
          result.updated++;
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(`Event ${change.eventId}: ${errorMessage}`);
      }
    }

    // 全処理成功時のみ lastSyncedAt を進め、同期トークンを保存する。
    // 一部失敗のままトークンを進めると Google Incremental Sync 仕様上、
    // 失敗した変更が二度と配信されず永久欠落する。
    if (result.errors.length === 0) {
      await recordCalendarSyncCompleted();
      if (changesResult.newSyncToken) {
        await saveCalendarSyncToken(changesResult.newSyncToken);
      }
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "syncFromCalendar" },
    });
    return {
      ...result,
      success: false,
      errors: [error instanceof Error ? error.message : "Unknown error"],
    };
  }
}

interface ProcessResult {
  action: "deleted" | "updated" | "skipped" | "not_found";
  reservationId?: string;
}

/**
 * 個々のカレンダー変更を処理
 */
async function processCalendarChange(
  change: CalendarChange,
): Promise<ProcessResult> {
  const reservation = await getReservationByCalendarEventId(change.eventId);

  if (!reservation) {
    // 予約が見つからない場合はスキップ
    return { action: "not_found" };
  }

  // カレンダーで削除された場合（GCAL-AUDIT-03: GCal 側が正本のため
  // デッドラインチェックは行わない。atomic claim 自体が active status gate を持つ）
  if (change.deleted) {
    const cancelResult = await cancelReservationFromCalendar({
      reservationId: reservation.id,
      existingNotes: reservation.notes,
    });

    if (!cancelResult.cancelled) {
      return { action: "skipped", reservationId: reservation.id };
    }

    // DB claim 成功後に副作用チェーン（返金・メール・通知・SmartLock・AuditLog）を
    // 発火する。GCal 側の削除がトリガーのため gcalDelete 副作用は suppress
    // （既に削除済みのイベントへ再度 delete をかけない）。
    await applyCancellationSideEffects({
      reservationId: reservation.id,
      cancellationReason: GCAL_DELETE_CANCELLATION_REASON,
      channel: "system",
      actorUserId: null,
      request: { ip: null, userAgent: null },
      suppress: { gcalDelete: true },
      awaitCompletion: true,
    });

    return { action: "deleted", reservationId: reservation.id };
  }

  // 時間変更の検出
  if (change.startTime && change.endTime) {
    const startChanged =
      change.startTime.getTime() !== reservation.startTime.getTime();
    const endChanged =
      change.endTime.getTime() !== reservation.endTime.getTime();

    if (startChanged || endChanged) {
      // GCAL-AUDIT-11: 決済確定/保留中の予約は金額・返金判断を伴うため、GCal 側の
      // 時間変更を重複時と同様に拒否する（UNPAID のみ即時反映を許可）。
      if (
        PAYMENT_STATUSES_BLOCKING_TIME_CHANGE.includes(
          reservation.paymentStatus,
        )
      ) {
        logError(
          new Error("Calendar time change rejected due to payment status"),
          {
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.LOW,
            context: {
              operation: "processCalendarChange",
              reservationId: reservation.id,
              paymentStatus: reservation.paymentStatus,
            },
          },
        );

        const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;
        fireAndForget(
          sendCalendarSyncRejectionEmail({
            reservationId: reservation.id,
            spaceName: reservation.space.name,
            customerName,
            customerEmail: reservation.guestEmail ?? reservation.customer.email,
            attemptedStartTime: change.startTime,
            attemptedEndTime: change.endTime,
            currentStartTime: reservation.startTime,
            currentEndTime: reservation.endTime,
            rejectionReason:
              "決済が確定/保留中のため、金額・返金の再計算なしに時間変更を反映できません。",
          }),
          {
            operation: "sendCalendarSyncRejectionEmail",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: reservation.id },
          },
        );

        return { action: "skipped", reservationId: reservation.id };
      }

      const transactionResult = await applyCalendarTimeChange({
        reservationId: reservation.id,
        spaceId: reservation.spaceId,
        existingNotes: reservation.notes,
        startTime: change.startTime,
        endTime: change.endTime,
      });

      if (!transactionResult.success) {
        logError(new Error("Calendar time change rejected due to overlap"), {
          category: ErrorCategory.VALIDATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "processCalendarChange",
            reservationId: reservation.id,
            attemptedStartTime: change.startTime.toISOString(),
            attemptedEndTime: change.endTime.toISOString(),
            conflictingReservationId:
              transactionResult.conflictingReservation.id,
          },
        });

        // 管理者にメール通知（非同期、トランザクション外）
        const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;
        fireAndForget(
          sendCalendarSyncRejectionEmail({
            reservationId: reservation.id,
            spaceName: reservation.space.name,
            customerName,
            customerEmail: reservation.guestEmail ?? reservation.customer.email,
            attemptedStartTime: change.startTime,
            attemptedEndTime: change.endTime,
            currentStartTime: reservation.startTime,
            currentEndTime: reservation.endTime,
            conflictingReservation: {
              id: transactionResult.conflictingReservation.id,
              startTime: transactionResult.conflictingReservation.startTime,
              endTime: transactionResult.conflictingReservation.endTime,
            },
          }),
          {
            operation: "sendCalendarSyncRejectionEmail",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: reservation.id },
          },
        );

        return { action: "skipped", reservationId: reservation.id };
      }

      return { action: "updated", reservationId: reservation.id };
    }
  }

  return { action: "skipped", reservationId: reservation.id };
}
