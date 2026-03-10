/**
 * カレンダー同期サービス
 *
 * 予約作成・更新・キャンセル時にGoogle Calendarと同期するサービス。
 * サービスアカウントまたはOAuth経由で連携します。
 *
 * ## 同期モード
 * - **サービスアカウント**: 共有カレンダーへの登録（推奨）
 * - **OAuth**: 管理者個人カレンダーへの登録（オプション）
 *
 * ## 双方向同期（Two-Way Sync）
 * - カレンダー側での変更を予約システムに反映
 * - ポーリングまたはWebhookで変更検知
 * - 競合時は既存予約を優先（変更拒否）
 *
 * @module shared/lib/calendar-sync
 */

import "server-only";
import {
  applyCalendarTimeChange,
  cancelReservationFromCalendar,
  clearReservationCalendarEvent,
  getCalendarSyncRuntimeState,
  getFailedCalendarSyncReservations,
  getReservationByCalendarEventId,
  markReservationCalendarSyncError,
  markReservationCalendarSyncSuccess,
  markReservationCalendarSyncUpdated,
  recordCalendarSyncStarted,
  saveCalendarSyncToken,
  saveReservationOAuthCalendarEvent,
} from "@/shared/domain/reservations/calendar-sync";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createOAuthCalendarEvent,
  isGoogleCalendarEnabled,
  fetchCalendarChanges,
  type CalendarEventParams,
  type CalendarChange,
} from "@/shared/lib/google-calendar";
import { sendCalendarSyncRejectionEmail } from "@/shared/lib/email-service";
import { omitUndefined } from "@/shared/lib/serialize";
import { format } from "date-fns";
import { ja } from "date-fns/locale";

// =============================================================================
// Types
// =============================================================================

export interface ReservationSyncData {
  reservationId: string;
  spaceName: string;
  customerName: string;
  customerEmail: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  notes?: string;
  totalPrice?: number | null;
}

export interface SyncResult {
  success: boolean;
  eventId?: string;
  oauthEventId?: string;
  error?: string;
}

// =============================================================================
// Calendar Event Formatting
// =============================================================================

/**
 * 予約情報からカレンダーイベントパラメータを生成
 */
function formatCalendarEvent(data: ReservationSyncData): CalendarEventParams {
  const formattedDate = format(data.startTime, "yyyy年M月d日 (EEEE)", {
    locale: ja,
  });
  const formattedStart = format(data.startTime, "HH:mm");
  const formattedEnd = format(data.endTime, "HH:mm");

  const descriptionLines = [
    `予約ID: ${data.reservationId.slice(0, 8).toUpperCase()}`,
    `お客様: ${data.customerName}`,
    `メール: ${data.customerEmail}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
  ];

  if (data.totalPrice !== undefined && data.totalPrice !== null) {
    descriptionLines.push(
      `料金: ${new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: "JPY",
      }).format(data.totalPrice)}`,
    );
  }

  if (data.notes) {
    descriptionLines.push(`備考: ${data.notes}`);
  }

  return omitUndefined({
    summary: `【予約】${data.spaceName} - ${data.customerName}様`,
    description: descriptionLines.join("\n"),
    location: data.location,
    startTime: data.startTime,
    endTime: data.endTime,
    attendeeEmail: data.customerEmail,
  });
}

// =============================================================================
// Sync Operations
// =============================================================================

/**
 * 予約作成時のカレンダー同期
 *
 * バックグラウンドで実行され、失敗しても予約自体は成功とする
 */
export async function syncReservationToCalendar(
  data: ReservationSyncData,
): Promise<SyncResult> {
  try {
    // Google Calendarが有効か確認
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true }; // 無効の場合は何もしない
    }

    const eventParams = formatCalendarEvent(data);
    const result = await createCalendarEvent(eventParams);

    if (result.success && result.eventId) {
      await markReservationCalendarSyncSuccess({
        reservationId: data.reservationId,
        eventId: result.eventId,
      });

      return {
        success: true,
        eventId: result.eventId,
      };
    }

    // エラーを記録
    await markReservationCalendarSyncError({
      reservationId: data.reservationId,
      error: result.error || "Unknown error",
    });

    logError(new Error(result.error || "Unknown error"), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "syncReservationToCalendar",
        reservationId: data.reservationId,
      },
    });
    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "syncReservationToCalendar",
        reservationId: data.reservationId,
      },
    });

    // エラーを記録（バックグラウンド）
    fireAndForget(
      markReservationCalendarSyncError({
        reservationId: data.reservationId,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        operation: "saveCalendarSyncError",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: { reservationId: data.reservationId },
      },
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 予約更新時のカレンダー同期
 */
export async function updateCalendarSync(
  data: ReservationSyncData,
  existingEventId: string,
): Promise<SyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true };
    }

    const eventParams = formatCalendarEvent(data);
    const result = await updateCalendarEvent(existingEventId, eventParams);

    if (result.success) {
      await markReservationCalendarSyncUpdated(data.reservationId);

      return { success: true, eventId: existingEventId };
    }

    await markReservationCalendarSyncError({
      reservationId: data.reservationId,
      error: result.error || "Update failed",
    });

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "updateCalendarSync",
        reservationId: data.reservationId,
        eventId: existingEventId,
      },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 予約キャンセル時のカレンダーイベント削除
 */
export async function deleteCalendarSync(
  reservationId: string,
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      return { success: true };
    }

    const result = await deleteCalendarEvent(eventId);

    if (result.success) {
      await clearReservationCalendarEvent(reservationId);

      return { success: true };
    }

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "deleteCalendarSync",
        reservationId,
        eventId,
      },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * 管理者の個人カレンダーにも同期（OAuth連携時）
 *
 * 管理者がOAuthで個人カレンダーを連携している場合、
 * 予約イベントを個人カレンダーにも追加します。
 *
 * @param adminUserId - 管理者ユーザーID
 * @param data - 予約同期データ
 * @returns 同期結果
 */
export async function syncToAdminCalendar(
  adminUserId: string,
  data: ReservationSyncData,
): Promise<SyncResult> {
  try {
    const eventParams = formatCalendarEvent(data);
    const result = await createOAuthCalendarEvent(adminUserId, eventParams);

    if (result.success && result.eventId) {
      await saveReservationOAuthCalendarEvent({
        reservationId: data.reservationId,
        eventId: result.eventId,
      });

      return { success: true, oauthEventId: result.eventId };
    }

    return omitUndefined({ success: false, error: result.error });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "syncToAdminCalendar",
        adminUserId,
        reservationId: data.reservationId,
      },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * 未同期の予約を一括同期（リトライ機能）
 */
export async function retryFailedSyncs(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const failedReservations = await getFailedCalendarSyncReservations();

  let succeeded = 0;
  let failed = 0;

  for (const reservation of failedReservations) {
    const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;
    const result = await syncReservationToCalendar(
      omitUndefined({
        reservationId: reservation.id,
        spaceName: reservation.space.name,
        customerName,
        customerEmail: reservation.customer.email,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        location: reservation.space.address ?? undefined,
        notes: reservation.notes ?? undefined,
        totalPrice: reservation.totalPrice,
      }),
    );

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    total: failedReservations.length,
    succeeded,
    failed,
  };
}

// =============================================================================
// Two-Way Sync (Phase 4)
// =============================================================================

export interface TwoWaySyncResult {
  success: boolean;
  processed: number;
  deleted: number;
  updated: number;
  errors: string[];
}

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

    await recordCalendarSyncStarted();

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

    // 同期トークンを保存
    if (changesResult.newSyncToken) {
      await saveCalendarSyncToken(changesResult.newSyncToken);
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

  // カレンダーで削除された場合
  if (change.deleted) {
    if (reservation.status !== "CANCELLED") {
      await cancelReservationFromCalendar({
        reservationId: reservation.id,
        existingNotes: reservation.notes,
      });

      return { action: "deleted", reservationId: reservation.id };
    }
    return { action: "skipped", reservationId: reservation.id };
  }

  // 時間変更の検出
  if (change.startTime && change.endTime) {
    const startChanged =
      change.startTime.getTime() !== reservation.startTime.getTime();
    const endChanged =
      change.endTime.getTime() !== reservation.endTime.getTime();

    if (startChanged || endChanged) {
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
            customerEmail: reservation.customer.email,
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

/**
 * 同期ステータスを取得
 */
export async function getSyncStatus(): Promise<{
  enabled: boolean;
  lastSyncedAt: Date | null;
  syncMethod: string;
  webhookActive: boolean;
  webhookExpiration: Date | null;
}> {
  const settings = await getCalendarSyncRuntimeState();

  return {
    enabled: settings.twoWaySyncEnabled,
    lastSyncedAt: settings.lastSyncedAt,
    syncMethod: settings.syncMethod,
    webhookActive: !!settings.webhookChannelId,
    webhookExpiration: settings.webhookExpiration,
  };
}
