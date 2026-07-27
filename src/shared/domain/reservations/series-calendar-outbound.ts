/**
 * 繰返し予約（ReservationSeries）→ Google Calendar の master event 操作。
 *
 * 単発予約の lib `outbound.ts` が instance 単位の同期を担うのに対し、本モジュールは
 * series 全体を表す 1 つの recurring master event に対する操作を担う
 * （`applyBulkCancellationSideEffects` の scope 別 1 回操作から呼ばれる）。
 *
 * Phase B.2.1 Task 5 で ReservationSeries.googleCalendarMasterEventId が追加され、
 * `getSeriesGcalMasterEventId` は domain 層 (calendar-sync.ts) 経由で実データを
 * 返すようになった。Phase B.2.1 Task C で `patchGcalMasterUntil` の stub を
 * 実装差替 (RRULE 再構築 + events.patch)。
 *
 * @module shared/domain/reservations/series-calendar-outbound
 */

import "server-only";
import {
  GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX,
  GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX,
  getSeriesForCalendarSync,
  getSeriesGcalMasterEventId as getSeriesGcalMasterEventIdFromDomain,
  getSeriesIdsWithMasterOperationFailure,
  getSeriesMasterOperationFailureInstances,
  markReservationCalendarSyncUpdated,
} from "@/shared/domain/reservations/calendar-sync";
import {
  deleteCalendarEvent,
  patchCalendarEvent,
} from "@/shared/domain/settings/google-calendar-api";
import { isGoogleCalendarConfigured } from "@/shared/domain/settings/google-calendar";
import { rebuildRruleWithUntil } from "@/shared/domain/reservations/series-rrule";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { omitUndefined } from "@/shared/lib/serialize";

/**
 * ReservationSeries に紐づく Google Calendar master event の ID を取得する。
 *
 * DB 永続化列 `ReservationSeries.googleCalendarMasterEventId` を返す薄い wrapper
 * （`calendar-sync.getSeriesGcalMasterEventId` への委譲）。
 * null は「未同期 or Google Calendar 無効」を表し、呼出側は master GCal 操作を skip する。
 */
export async function getSeriesGcalMasterEventId(
  seriesId: string,
): Promise<string | null> {
  return getSeriesGcalMasterEventIdFromDomain(seriesId);
}

/**
 * series の「これ以降の回」を打ち切るため、master event の RRULE に UNTIL を注入して
 * 更新する (`this-and-following` scope 用、Phase B.2.1 Task C 実装)。
 *
 * flow:
 *   1. domain (calendar-sync.getSeriesForCalendarSync) から現行 series の RRULE と
 *      dtstart を取得 (deletedAt=null gate は既存 helper が担う)
 *   2. rebuildRruleWithUntil で新 RRULE 文字列を生成 (COUNT → UNTIL 変換、RFC 5545)
 *   3. Google Calendar `events.patch` で `recurrence: [rebuilt]` を送信 (部分更新)
 *
 * 失敗は logError に吸収して throw しないが、呼出側 (`applyBulkCancellationSideEffects`)
 * が失敗を検知して retry pool にマークできるよう `{success, error?}` を返す
 * (GCAL-OUTBOUND-07: 旧実装は void を返し fire-and-forget の log-only で
 * 失敗が握り潰され、cron からの再試行経路が存在しなかった)。
 *
 * GCAL-OUTBOUND-05: `googleCalendarEnabled` トグルではなく
 * `isGoogleCalendarConfigured()` を gate にする。series の this-and-following
 * 打ち切りは実質 delete 相当のため、トグル OFF でも実行できる必要がある。
 */
export async function patchGcalMasterUntil(input: {
  masterEventId: string;
  seriesId: string;
  until: Date;
}): Promise<{ success: boolean; error?: string }> {
  const isConfigured = await isGoogleCalendarConfigured();
  if (!isConfigured) {
    return { success: true };
  }

  const series = await getSeriesForCalendarSync(input.seriesId);
  if (!series) {
    const message = `Series ${input.seriesId} not found for patchGcalMasterUntil (may be soft-deleted)`;
    logError(new Error(message), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "patchGcalMasterUntil",
        seriesId: input.seriesId,
        masterEventId: input.masterEventId,
      },
    });
    return { success: false, error: message };
  }

  const rebuilt = rebuildRruleWithUntil(
    series.rrule,
    series.dtstart,
    input.until,
  );
  const result = await patchCalendarEvent(
    input.masterEventId,
    { recurrence: [`RRULE:${rebuilt}`] },
    { ignoreEnabledToggle: true },
  );
  if (!result.success) {
    logError(new Error(result.error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "patchGcalMasterUntil",
        masterEventId: input.masterEventId,
        seriesId: input.seriesId,
      },
    });
    return omitUndefined({ success: false, error: result.error });
  }
  return { success: true };
}

/**
 * series 全体キャンセル時、master event ごと削除する（`series-all` scope 用）。
 *
 * recurring event の master を削除すれば Google Calendar 側で全 occurrence が
 * 連動して消える標準挙動のため、series 専用の API は不要。既存の単発予約と同じ
 * `deleteCalendarEvent`（domain google-calendar-api）をそのまま再利用する。
 *
 * GCAL-OUTBOUND-05 / 07: `isGoogleCalendarConfigured()` gate + `{success, error?}`
 * 返却は `patchGcalMasterUntil` と同じ設計（上記 JSDoc 参照）。
 */
export async function deleteGcalMaster(
  masterEventId: string,
): Promise<{ success: boolean; error?: string }> {
  const isConfigured = await isGoogleCalendarConfigured();
  if (!isConfigured) {
    return { success: true };
  }

  const result = await deleteCalendarEvent(masterEventId, {
    ignoreEnabledToggle: true,
  });
  if (!result.success) {
    logError(new Error(result.error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { operation: "deleteGcalMaster", masterEventId },
    });
    return { success: false, error: result.error };
  }
  return { success: true };
}

// =============================================================================
// Retry (GCAL-OUTBOUND-07)
// =============================================================================

/**
 * `patchGcalMasterUntil` / `deleteGcalMaster` の失敗を再試行する
 * (`/api/cron/calendar-sync-retry` から `outbound.ts` の他 retry 関数と並列実行)。
 *
 * `cancellation-side-effects.ts` の Step 2 が失敗時に typed prefix
 * (`GCAL_SERIES_MASTER_*_FAILED_PREFIX`) 付きの `calendarSyncError` を対象
 * instance へ書き込む契約になっており、本関数はその prefix から操作種別と
 * (patch の場合) UNTIL 値を復号して再試行する。成功したら対象 instance 全件の
 * `calendarSyncError` をクリアする。
 *
 * `getSeriesGcalMasterEventId` が null (master 自体が既に無い/未同期) の場合は
 * 再試行できないため failed 計上のみ行う。
 */
export async function retryFailedSeriesMasterOperations(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const seriesIds = await getSeriesIdsWithMasterOperationFailure();

  let total = 0;
  let succeeded = 0;
  let failed = 0;

  for (const seriesId of seriesIds) {
    const instances = await getSeriesMasterOperationFailureInstances(seriesId);
    if (instances.length === 0) continue;
    total += instances.length;

    const masterEventId = await getSeriesGcalMasterEventIdFromDomain(seriesId);
    if (!masterEventId) {
      failed += instances.length;
      logError(
        new Error(
          `series ${seriesId} has master operation failure but no master eventId`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "retryFailedSeriesMasterOperations.missingMaster",
            seriesId,
          },
        },
      );
      continue;
    }

    const sample = instances[0];
    if (!sample) continue;

    try {
      if (
        sample.calendarSyncError.startsWith(
          GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX,
        )
      ) {
        const result = await deleteGcalMaster(masterEventId);
        if (result.success) {
          await Promise.all(
            instances.map((i) => markReservationCalendarSyncUpdated(i.id)),
          );
          succeeded += instances.length;
        } else {
          failed += instances.length;
        }
      } else if (
        sample.calendarSyncError.startsWith(
          GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX,
        )
      ) {
        const encoded = sample.calendarSyncError.slice(
          GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX.length,
        );
        const [untilIso] = encoded.split("|");
        const until =
          untilIso && !Number.isNaN(Date.parse(untilIso))
            ? new Date(untilIso)
            : new Date();
        const result = await patchGcalMasterUntil({
          masterEventId,
          seriesId,
          until,
        });
        if (result.success) {
          await Promise.all(
            instances.map((i) => markReservationCalendarSyncUpdated(i.id)),
          );
          succeeded += instances.length;
        } else {
          failed += instances.length;
        }
      } else {
        // 想定外の prefix (typed prefix 契約違反)。retry pool に残し続けても
        // 意味が無いため failed 計上のみ行い、次回 cron でも再検査される。
        failed += instances.length;
      }
    } catch (error) {
      failed += instances.length;
      logError(normalizeError(error), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "retryFailedSeriesMasterOperations",
          seriesId,
          masterEventId,
        },
      });
    }
  }

  return { total, succeeded, failed };
}
