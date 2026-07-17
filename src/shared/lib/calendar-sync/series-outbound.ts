/**
 * 繰返し予約（ReservationSeries）→ Google Calendar の master event 操作。
 *
 * 単発予約の `outbound.ts` が instance 単位の同期を担うのに対し、本モジュールは
 * series 全体を表す 1 つの recurring master event に対する操作を担う
 * （`applyBulkCancellationSideEffects` の scope 別 1 回操作から呼ばれる）。
 *
 * Phase B.2 は PR を分割して進めており、ReservationSeries に master event id を
 * 永続化する仕組み・RRULE の UNTIL 再構築は Task 16（GCal outbound PR）で実装する。
 * 本ファイルはその依存が固まる前に `cancellation-side-effects.ts` 側の呼び出し形状
 * （関数シグネチャ）を確定させるための stub を含む。呼び出し側はテストで
 * `mock.module` により差し替えるため、stub の中身自体は本番動作に影響しない
 * （`getSeriesGcalMasterEventId` が常に null を返す限り、master GCal 操作は
 * no-op skip される）。
 *
 * @module shared/lib/calendar-sync/series-outbound
 */

import "server-only";
import { deleteCalendarEvent } from "@/shared/lib/google-calendar";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";

/**
 * ReservationSeries に紐づく Google Calendar master event の ID を取得する。
 *
 * stub: Task 16 で ReservationSeries 側に master event id の永続化列が追加され次第、
 * 実データ取得に差し替える。現状は常に `null`（= 呼び出し側の master GCal 操作を
 * no-op skip）を返す。
 */
export async function getSeriesGcalMasterEventId(
  seriesId: string,
): Promise<string | null> {
  void seriesId;
  return Promise.resolve(null);
}

/**
 * series の「これ以降の回」を打ち切るため、master event の RRULE に UNTIL を設定して
 * 更新する（`this-and-following` scope 用）。
 *
 * stub: RRULE の再構築（`series-rrule.ts` 連携）と Google Calendar
 * `events.patch({ recurrence })` 呼び出しは Task 16 で実装する。
 */
export async function patchGcalMasterUntil(
  masterEventId: string,
  until: Date,
): Promise<void> {
  void masterEventId;
  void until;
  // Task 16: googleapis calendar.events.patch({ recurrence: [rebuiltRruleWithUntil] })
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
