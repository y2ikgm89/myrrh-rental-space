/**
 * 繰返し予約（ReservationSeries）→ Google Calendar の master event 操作。
 *
 * 単発予約の `outbound.ts` が instance 単位の同期を担うのに対し、本モジュールは
 * series 全体を表す 1 つの recurring master event に対する操作を担う
 * （`applyBulkCancellationSideEffects` の scope 別 1 回操作から呼ばれる）。
 *
 * Phase B.2.1 Task 5 で ReservationSeries.googleCalendarMasterEventId が追加され、
 * `getSeriesGcalMasterEventId` は domain 層 (calendar-sync.ts) 経由で実データを
 * 返すようになった。RRULE 再構築を伴う `patchGcalMasterUntil` は将来 phase で
 * 実装予定 (現状は master event 側の UNTIL 更新は no-op のまま)。
 *
 * @module shared/lib/calendar-sync/series-outbound
 */

import "server-only";
import { deleteCalendarEvent } from "@/shared/lib/google-calendar";
import { getSeriesGcalMasterEventId as getSeriesGcalMasterEventIdFromDomain } from "@/shared/domain/reservations/calendar-sync";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";

/**
 * ReservationSeries に紐づく Google Calendar master event の ID を取得する。
 *
 * DB 永続化列 `ReservationSeries.googleCalendarMasterEventId` を返す薄い wrapper。
 * placement gate 上、`shared/lib` からは直接 Prisma を触れないため domain 層に委譲する。
 * null は「未同期 or Google Calendar 無効」を表し、呼出側は master GCal 操作を skip する。
 */
export async function getSeriesGcalMasterEventId(
  seriesId: string,
): Promise<string | null> {
  return getSeriesGcalMasterEventIdFromDomain(seriesId);
}

/**
 * series の「これ以降の回」を打ち切るため、master event の RRULE に UNTIL を設定して
 * 更新する（`this-and-following` scope 用）。
 *
 * stub: RRULE の再構築（`series-rrule.ts` 連携）と Google Calendar
 * `events.patch({ recurrence })` 呼び出しは将来 phase で実装する。現状は master
 * event の削除ではなく UNTIL 更新のみで child event が Google 側から消える契約を
 * 提供できないため、safe-side として no-op のまま (customer 通知や child イベント
 * の可視性は per-instance の GCal delete が担う既存経路で担保されている)。
 */
export async function patchGcalMasterUntil(
  masterEventId: string,
  until: Date,
): Promise<void> {
  void masterEventId;
  void until;
  await Promise.resolve();
}

/**
 * series 全体キャンセル時、master event ごと削除する（`series-all` scope 用）。
 *
 * recurring event の master を削除すれば Google Calendar 側で全 occurrence が
 * 連動して消える標準挙動のため、series 専用の API は不要。既存の単発予約と同じ
 * `deleteCalendarEvent`（`@/shared/lib/google-calendar`）をそのまま再利用する。
 */
export async function deleteGcalMaster(masterEventId: string): Promise<void> {
  const result = await deleteCalendarEvent(masterEventId);
  if (!result.success) {
    logError(new Error(result.error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { operation: "deleteGcalMaster", masterEventId },
    });
  }
}
