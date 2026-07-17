/**
 * 繰返し予約（ReservationSeries）→ Google Calendar の master event 操作。
 *
 * 単発予約の `outbound.ts` が instance 単位の同期を担うのに対し、本モジュールは
 * series 全体を表す 1 つの recurring master event に対する操作を担う
 * （`applyBulkCancellationSideEffects` の scope 別 1 回操作から呼ばれる）。
 *
 * Phase B.2.1 Task 5 で ReservationSeries.googleCalendarMasterEventId が追加され、
 * `getSeriesGcalMasterEventId` は domain 層 (calendar-sync.ts) 経由で実データを
 * 返すようになった。Phase B.2.1 Task C で `patchGcalMasterUntil` の stub を
 * 実装差替 (RRULE 再構築 + events.patch)。
 *
 * @module shared/lib/calendar-sync/series-outbound
 */

import "server-only";
import {
  deleteCalendarEvent,
  patchCalendarEvent,
} from "@/shared/lib/google-calendar";
import {
  getSeriesForCalendarSync,
  getSeriesGcalMasterEventId as getSeriesGcalMasterEventIdFromDomain,
} from "@/shared/domain/reservations/calendar-sync";
import { rebuildRruleWithUntil } from "@/shared/domain/reservations/series-rrule";
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
 * series の「これ以降の回」を打ち切るため、master event の RRULE に UNTIL を注入して
 * 更新する (`this-and-following` scope 用、Phase B.2.1 Task C 実装)。
 *
 * flow:
 *   1. domain (calendar-sync.getSeriesForCalendarSync) から現行 series の RRULE と
 *      dtstart を取得 (deletedAt=null gate は既存 helper が担う)
 *   2. rebuildRruleWithUntil で新 RRULE 文字列を生成 (COUNT → UNTIL 変換、RFC 5545)
 *   3. Google Calendar `events.patch` で `recurrence: [rebuilt]` を送信 (部分更新)
 *
 * 失敗は logError に吸収し throw しない (呼出側 `applyBulkCancellationSideEffects` は
 * fire-and-forget 相当で継続する)。
 */
export async function patchGcalMasterUntil(input: {
  masterEventId: string;
  seriesId: string;
  until: Date;
}): Promise<void> {
  const series = await getSeriesForCalendarSync(input.seriesId);
  if (!series) {
    logError(
      new Error(
        `Series ${input.seriesId} not found for patchGcalMasterUntil (may be soft-deleted)`,
      ),
      {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "patchGcalMasterUntil",
          seriesId: input.seriesId,
          masterEventId: input.masterEventId,
        },
      },
    );
    return;
  }

  const rebuilt = rebuildRruleWithUntil(
    series.rrule,
    series.dtstart,
    input.until,
  );
  const result = await patchCalendarEvent(input.masterEventId, {
    recurrence: [`RRULE:${rebuilt}`],
  });
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
  }
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
