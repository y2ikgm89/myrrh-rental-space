/**
 * 予約→カレンダー（単方向同期）
 *
 * 予約作成・更新・キャンセル時にGoogle Calendarと同期するサービス。
 * サービスアカウントまたはOAuth経由で連携します。
 *
 * @module shared/lib/calendar-sync/outbound
 */

import "server-only";
import { formatCurrency } from "@/shared/lib/pricing/format";
import {
  clearReservationCalendarEvent,
  GCAL_DELETE_FAILED_PREFIX,
  getCalendarSyncRuntimeState,
  getFailedCalendarSyncReservations,
  getFailedCalendarSyncSeriesIds,
  getSeriesForCalendarSync,
  getSeriesGcalMasterEventId,
  getSeriesInstanceStartTimes,
  markReservationCalendarSyncError,
  markReservationCalendarSyncSuccess,
  markReservationCalendarSyncUpdated,
  markSeriesInstanceCalendarSyncSuccess,
  markSeriesMasterEventCreated,
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
  fetchEventInstances,
  isGoogleCalendarEnabled,
  type CalendarEventInstance,
  type CalendarEventParams,
  type CalendarEventResult,
} from "@/shared/lib/google-calendar";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  formatDateWithWeekday,
  formatTimeShort,
} from "@/shared/lib/date-format";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import { OUTBOUND_RESERVATION_MARKER } from "./loop-prevention";
import type { ReservationSyncData, SyncResult } from "./types";

// =============================================================================
// Calendar Event Formatting
// =============================================================================

/**
 * 予約情報からカレンダーイベントパラメータを生成
 */
function formatCalendarEvent(data: ReservationSyncData): CalendarEventParams {
  const formattedDate = formatDateWithWeekday(data.startTime);
  const formattedStart = formatTimeShort(data.startTime);
  const formattedEnd = formatTimeShort(data.endTime);

  const descriptionLines = [
    // inbound ループ防止マーカー（loop-prevention.ts の SSoT を使用）
    `${OUTBOUND_RESERVATION_MARKER} ${data.reservationId.slice(0, 8).toUpperCase()}`,
    `お客様: ${data.customerName}`,
    `メール: ${data.customerEmail}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
  ];

  if (data.totalPrice !== undefined && data.totalPrice !== null) {
    descriptionLines.push(`料金: ${formatCurrency(data.totalPrice)}`);
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
    // options を省略 = withMeet: false 固定（業界標準に従い物理 space 予約に Meet URL は
    // 付与しない。Phase B.1 task 8 で確定 — ここに withMeet: true を足さないこと）。
    const result = await createCalendarEvent(eventParams);

    if (result.success && result.eventId) {
      try {
        await markReservationCalendarSyncSuccess({
          reservationId: data.reservationId,
          eventId: result.eventId,
        });
      } catch (dbError) {
        // GCAL-AUDIT-07: GCal 側の作成は成功したが DB write-back が失敗した場合、
        // googleCalendarEventId が null のまま残り、次回 retry が
        // createCalendarEvent を再実行して GCal 上に重複イベントを作ってしまう。
        // 補償として作成済み GCal event を削除してから失敗として記録する
        // (create の atomicity を模倣する compensating action)。
        const compensationResult = await deleteCalendarEvent(result.eventId);
        if (!compensationResult.success) {
          logError(
            new Error(
              `Compensating delete failed after DB write-back error: ${compensationResult.error}`,
            ),
            {
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.HIGH,
              context: {
                operation: "syncReservationToCalendar.compensate",
                reservationId: data.reservationId,
                eventId: result.eventId,
              },
            },
          );
        }

        const message =
          dbError instanceof Error ? dbError.message : "Unknown error";
        logError(normalizeError(dbError), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: {
            operation: "syncReservationToCalendar.writeBack",
            reservationId: data.reservationId,
          },
        });
        fireAndForget(
          markReservationCalendarSyncError({
            reservationId: data.reservationId,
            error: message,
          }),
          {
            operation: "saveCalendarSyncError",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.LOW,
            context: { reservationId: data.reservationId },
          },
        );
        return { success: false, error: message };
      }

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
    const message = error instanceof Error ? error.message : "Unknown error";
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "updateCalendarSync",
        reservationId: data.reservationId,
        eventId: existingEventId,
      },
    });
    // GCAL-AUDIT-05: 例外経路は従来 markReservationCalendarSyncError を呼んでおらず、
    // `calendarSyncError` が更新されないため retry pool から漏れていた。
    fireAndForget(
      markReservationCalendarSyncError({
        reservationId: data.reservationId,
        error: message,
      }),
      {
        operation: "saveCalendarSyncError",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: { reservationId: data.reservationId },
      },
    );
    return { success: false, error: message };
  }
}

/**
 * 予約キャンセル時のカレンダーイベント削除
 *
 * GCAL-AUDIT-05: 失敗時は `googleCalendarEventId` を保持したまま
 * `GCAL_DELETE_FAILED_PREFIX` 付きのエラーを記録する（GCal 上にイベントが
 * まだ存在するため、次回 retry は create ではなく delete を再試行する契約）。
 */
export async function deleteCalendarSync(
  reservationId: string,
  eventId: string,
): Promise<{ success: true } | { success: false; error: string }> {
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

    await markReservationCalendarSyncError({
      reservationId,
      error: `${GCAL_DELETE_FAILED_PREFIX}${result.error}`,
    });

    return { success: false, error: result.error };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "deleteCalendarSync",
        reservationId,
        eventId,
      },
    });
    fireAndForget(
      markReservationCalendarSyncError({
        reservationId,
        error: `${GCAL_DELETE_FAILED_PREFIX}${message}`,
      }),
      {
        operation: "saveCalendarSyncError",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        context: { reservationId },
      },
    );
    return { success: false, error: message };
  }
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * 未同期の予約を一括同期 (リトライ機能)。
 *
 * standalone 予約は `syncReservationToCalendar` (RRULE 無し createCalendarEvent) で
 * 再送する。GCAL-RETRY-04: series-child の instance は `getFailedCalendarSyncReservations`
 * の `seriesId: null` gate で除外されており、代わりに `retryFailedSeriesCalendarSyncs`
 * が既存の master event に対する `fetchEventInstances` + write-back を再試行する。
 * 両者を並列 (順序依存無し、独立した失敗集合) で走らせ、合計を返す。
 */
export async function retryFailedSyncs(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const [standalone, series] = await Promise.all([
    retryFailedStandaloneCalendarSyncs(),
    retryFailedSeriesCalendarSyncs(),
  ]);
  return {
    total: standalone.total + series.total,
    succeeded: standalone.succeeded + series.succeeded,
    failed: standalone.failed + series.failed,
  };
}

/**
 * GCAL-AUDIT-05: 失敗した予約を eventId の有無 + エラー prefix で
 * create / update / delete のいずれかに振り分けて再試行する。
 *
 * - `googleCalendarEventId` 無し → create (`syncReservationToCalendar`)
 * - `googleCalendarEventId` 有り + `GCAL_DELETE_FAILED_PREFIX` エラー → delete
 *   (`deleteCalendarSync`)。CANCELLED のまま GCal 上にイベントが残っている状態。
 * - `googleCalendarEventId` 有り + それ以外のエラー → update (`updateCalendarSync`)
 */
async function retryFailedStandaloneCalendarSyncs(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const failedReservations = await getFailedCalendarSyncReservations();

  let succeeded = 0;
  let failed = 0;

  for (const reservation of failedReservations) {
    const customerName = `${reservation.customer.lastName} ${reservation.customer.firstName}`;
    const syncData = omitUndefined({
      reservationId: reservation.id,
      spaceName: reservation.space.name,
      customerName,
      customerEmail: reservation.guestEmail ?? reservation.customer.email,
      startTime: reservation.startTime,
      endTime: reservation.endTime,
      location: reservation.space.lineAddress,
      notes: reservation.notes ?? undefined,
      totalPrice: reservation.totalPrice,
    });

    let result: { success: boolean };
    if (reservation.googleCalendarEventId === null) {
      result = await syncReservationToCalendar(syncData);
    } else if (
      reservation.calendarSyncError?.startsWith(GCAL_DELETE_FAILED_PREFIX)
    ) {
      result = await deleteCalendarSync(
        reservation.id,
        reservation.googleCalendarEventId,
      );
    } else {
      result = await updateCalendarSync(
        syncData,
        reservation.googleCalendarEventId,
      );
    }

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

/**
 * GCAL-RETRY-04: series-child の instance を standalone `createCalendarEvent` に
 * かけると master の RRULE 展開との時刻二重招待になるため、series-child は
 * 独立経路で「既存 master に対する `fetchEventInstances` + write-back」だけを再試行する。
 *
 * `syncReservationSeriesToCalendar` を呼ばない: あれは `createCalendarEvent` を必ず
 * 発火するため、master が既存 (`markSeriesMasterEventCreated` 済) の series で呼ぶと
 * 二重の master event が作成される。retry pool に来る失敗 series は
 * `syncReservationSeriesToCalendar` 内の `fetchEventInstances` 失敗経路
 * (partial success) が唯一で、そこは master 永続化を完了させた後にしか到達しない。
 * ゆえに master 未永続な series はこの retry では拾えず、logError で可視化する。
 */
async function retryFailedSeriesCalendarSyncs(): Promise<{
  total: number;
  succeeded: number;
  failed: number;
}> {
  const seriesIds = await getFailedCalendarSyncSeriesIds();

  let total = 0;
  let succeeded = 0;
  let failed = 0;

  for (const seriesId of seriesIds) {
    const masterEventId = await getSeriesGcalMasterEventId(seriesId);
    if (!masterEventId) {
      // 想定外: retry pool に来ている series の master が永続化されていない。
      // markAllSeriesInstancesAsFailed は master 永続化後にしか呼ばれないため
      // 通常は起きない。監査ログに残して次サイクルで再試行する。
      const startTimes = await getSeriesInstanceStartTimes(seriesId);
      total += startTimes.length;
      failed += startTimes.length;
      logError(
        new Error(
          `series ${seriesId} has failed instances but no master eventId; skipping`,
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "retryFailedSeriesCalendarSyncs.missingMaster",
            seriesId,
          },
        },
      );
      continue;
    }

    const instancesResult = await fetchEventInstances(masterEventId);
    if (
      !instancesResult.success ||
      instancesResult.instances === undefined ||
      instancesResult.instances.length === 0
    ) {
      const startTimes = await getSeriesInstanceStartTimes(seriesId);
      total += startTimes.length;
      failed += startTimes.length;
      logError(
        new Error(
          instancesResult.error ?? "fetchEventInstances failed during retry",
        ),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "retryFailedSeriesCalendarSyncs.fetchInstances",
            seriesId,
            masterEventId,
          },
        },
      );
      continue;
    }

    const {
      matched,
      total: seriesTotal,
      unmatchedReservationIds,
    } = await writeBackInstanceGoogleCalendarEventIds({
      seriesId,
      instances: instancesResult.instances,
    });
    if (unmatchedReservationIds.length > 0) {
      await markUnmatchedSeriesInstances({
        unmatchedReservationIds,
        error: `series ${seriesId} write-back partial: ${matched}/${seriesTotal} instances matched`,
      });
    }
    total += seriesTotal;
    succeeded += matched;
    failed += seriesTotal - matched;
  }

  return { total, succeeded, failed };
}

// =============================================================================
// Reservation Series (Phase B.2 task 16)
// =============================================================================

/**
 * 各 instance の startTime → GCal child eventId map を作成する。
 *
 * child eventId (`{masterId}_{yyyymmddTHHMMSSZ}`) は Google Calendar が RRULE を
 * 展開して生成する契約。startTime 完全一致で結び付ける。tolerance を持たせない
 * (GCal は master の DTSTART と同じ UTC 時刻を展開点として使うため、application
 * 側 series.dtstart + duration 経由の instance startTime と bit-for-bit 一致する)。
 */
function buildInstanceIdMapByStartTime(
  instances: readonly CalendarEventInstance[],
): Map<number, string> {
  const map = new Map<number, string>();
  for (const inst of instances) {
    map.set(inst.startTime.getTime(), inst.id);
  }
  return map;
}

/**
 * 各 Reservation.googleCalendarEventId に GCal child eventId を write-back する
 * (Phase B.2 task 16)。
 *
 * 一致条件: `Reservation.seriesId === input.seriesId` かつ
 * `Reservation.startTime` が GCal instance の startTime と一致するもの。
 * 未マッチ (GCal instance が欠落) の Reservation は skip し、
 * `matched` と `total` を返して呼出側で監査ログに残せるようにする。
 */
export async function writeBackInstanceGoogleCalendarEventIds(input: {
  seriesId: string;
  instances: readonly CalendarEventInstance[];
}): Promise<{
  matched: number;
  total: number;
  unmatchedReservationIds: string[];
}> {
  const reservations = await getSeriesInstanceStartTimes(input.seriesId);
  const idByStart = buildInstanceIdMapByStartTime(input.instances);

  // PERF-04: 各 update は互いに独立 (tx / advisory lock 無し、順序依存無し) のため
  // Promise.all で並列化する。sequential await だと 52-instance の年 series で
  // Cloud Run→Neon RTT を 52 回積み上げ ~500ms-1.5s の空 latency が admin action
  // (T10 admin proxy registration 経路含む) の完了時間に乗っていた。
  // db-domain.md 「tx 内 Promise.all 禁止」ルールは interactive tx callback 内の
  // 話で、ここは tx 外の独立 write なので Prisma pool の並列 acquire で問題なし。
  const results = await Promise.all(
    reservations.map(async (r) => {
      const gcalId = idByStart.get(r.startTime.getTime());
      if (gcalId === undefined) return { id: r.id, matched: false as const };
      await markSeriesInstanceCalendarSyncSuccess({
        reservationId: r.id,
        googleCalendarEventId: gcalId,
      });
      return { id: r.id, matched: true as const };
    }),
  );
  const matched = results.filter((r) => r.matched).length;
  const unmatchedReservationIds = results
    .filter((r) => !r.matched)
    .map((r) => r.id);

  return { matched, total: reservations.length, unmatchedReservationIds };
}

/**
 * GCAL-AUDIT-06: write-back で未マッチだった instance に `calendarSyncError` を
 * 記録し、retry pool (`getFailedCalendarSyncSeriesIds`) で拾えるようにする
 * (`googleCalendarEventId` が null のまま `calendarSyncError` も null だと
 * 失敗が可視化されず永久に取りこぼされる)。
 */
async function markUnmatchedSeriesInstances(input: {
  unmatchedReservationIds: string[];
  error: string;
}): Promise<void> {
  await Promise.all(
    input.unmatchedReservationIds.map((reservationId) =>
      markReservationCalendarSyncError({ reservationId, error: input.error }),
    ),
  );
}

/**
 * `syncReservationSeriesToCalendar` の戻り値。
 *
 * - `success: true` — master event 作成 + 全 instance の write-back まで完了 (eventId 有)。
 *   Google Calendar 無効時の no-op success (eventId 無) も同じ arm を使う。
 * - `success: false` — series not found / `createCalendarEvent` 失敗 / 予期せぬ例外。
 *   master event 自体が未作成、GCal 側に痕跡なし。
 * - `success: "partial"` — master event は GCal 上に作成済で
 *   `ReservationSeries.googleCalendarMasterEventId` にも永続化された。ただし
 *   `fetchEventInstances` (または write-back) が失敗し、child eventId の書き戻しが
 *   できなかった。全 instance の `Reservation.calendarSyncError` を埋めて
 *   `/api/cron/calendar-sync-retry` の対象に載せる (GCAL-RETRY-03)。呼出側は
 *   master delete による cleanup 判断が可能。
 */
export type SeriesCalendarSyncResult =
  | (CalendarEventResult & { success: true })
  | { success: false; error: string }
  | {
      success: "partial";
      masterCreated: true;
      masterEventId: string;
      instancesWriteBack: false;
      error: string;
    };

/**
 * fetchEventInstances 失敗時に、series 配下の全 Reservation を FAILED として
 * marker し `/api/cron/calendar-sync-retry` で拾えるようにする。
 *
 * `Promise.all` で並列に write する (順序依存無し、tx 外の独立 update)。
 * `Promise.allSettled` ではなく `Promise.all` を選択: 個別 write が失敗した場合
 * は上位 catch で丸めて logError → partial 返却する (write が全滅した場合は
 * 次サイクルで再試行されないため、上位で明示的にエラー扱いする)。
 */
async function markAllSeriesInstancesAsFailed(input: {
  seriesId: string;
  error: string;
}): Promise<void> {
  const reservations = await getSeriesInstanceStartTimes(input.seriesId);
  await Promise.all(
    reservations.map((r) =>
      markReservationCalendarSyncError({
        reservationId: r.id,
        error: input.error,
      }),
    ),
  );
}

/**
 * 定期予約 (ReservationSeries) を Google Calendar に master event として同期する
 * (Phase B.2 task 16 + B.2.1 Task 5 + GCAL-RETRY-03)。
 *
 * flow: fetch series + first instance → createCalendarEvent with `recurrence`
 * → markSeriesMasterEventCreated (永続化) → fetchEventInstances(masterId)
 * → writeBackInstanceGoogleCalendarEventIds。Google Calendar 無効時は no-op success。
 *
 * master event ID は `ReservationSeries.googleCalendarMasterEventId` に永続化される
 * (Phase B.2.1 Task 5 で追加)。bulk cancel の series-level GCal 操作 (deleteGcalMaster
 * / patchGcalMasterUntil) は非 null 時のみ発火する。
 *
 * GCAL-RETRY-03: fetchEventInstances (または write-back) が失敗した場合、
 * 各 Reservation.calendarSyncError を埋めて `/api/cron/calendar-sync-retry`
 * で再試行できる状態にし、`success: "partial"` を返す (旧実装は silent `success: true`
 * を返して child eventId が null のまま放置されていた)。
 */
export async function syncReservationSeriesToCalendar(
  seriesId: string,
): Promise<SeriesCalendarSyncResult> {
  try {
    const isEnabled = await isGoogleCalendarEnabled();
    if (!isEnabled) {
      // 他の outbound sync 関数と同じく「無効 = no-op success」の慣例に揃える。
      return { success: true };
    }

    const series = await getSeriesForCalendarSync(seriesId);
    if (!series) {
      return { success: false, error: `Series ${seriesId} not found` };
    }

    const endTime = new Date(
      series.dtstart.getTime() + series.duration * 60_000,
    );
    const customerName =
      `${series.customerLastName} ${series.customerFirstName}`.trim();
    const lineAddress = formatSpaceLineAddress(
      series.locationAddress,
      series.spaceAddressDetail,
    );

    const eventParams: CalendarEventParams = omitUndefined({
      summary: `【定期予約】${series.spaceName} - ${customerName}様`,
      description: [
        `${OUTBOUND_RESERVATION_MARKER} ${series.id.slice(0, 8).toUpperCase()}`,
        `お客様: ${customerName}`,
        `メール: ${series.customerEmail}`,
        `繰返し: ${series.rrule}`,
      ].join("\n"),
      location: lineAddress,
      startTime: series.dtstart,
      endTime,
      attendeeEmail: series.customerEmail,
      // Google Calendar API は `RRULE:` prefix 込みの完全形を要求する。
      recurrence: [`RRULE:${series.rrule}`],
    });

    const result = await createCalendarEvent(eventParams);
    if (!result.success || result.eventId === undefined) {
      const errMsg = result.error ?? "createCalendarEvent failed";
      logError(new Error(errMsg), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { operation: "syncReservationSeriesToCalendar", seriesId },
      });
      // GCAL-AUDIT-06: master 作成自体が失敗した場合も、他の失敗経路
      // (fetchInstances 失敗) と同様に全 instance を FAILED にして retry pool
      // (`getFailedCalendarSyncSeriesIds`) に載せる（旧実装は master 未作成時に
      // instance 側へ一切マークしておらず、series 全体が silent に取りこぼされていた）。
      try {
        await markAllSeriesInstancesAsFailed({
          seriesId,
          error: `series ${seriesId} master creation failed: ${errMsg}`,
        });
      } catch (markError) {
        logError(normalizeError(markError), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation:
              "syncReservationSeriesToCalendar.markInstancesFailedAfterCreate",
            seriesId,
          },
        });
      }
      return { success: false, error: errMsg };
    }

    const masterEventId = result.eventId;

    // master event ID を ReservationSeries に永続化 (Phase B.2.1 Task 5)。
    // fetchEventInstances より先に呼ぶことで、write-back 失敗時でも series cancel の
    // series-level GCal 操作 (deleteGcalMaster) が master event に届く状態を保証する。
    await markSeriesMasterEventCreated({ seriesId, masterEventId });

    const instancesResult = await fetchEventInstances(masterEventId);
    if (
      !instancesResult.success ||
      instancesResult.instances === undefined ||
      instancesResult.instances.length === 0
    ) {
      // GCAL-RETRY-03: 旧実装は success:true を返して child eventId 未 write-back の
      // まま放置していた。以降 admin から GCal API 経由で instance を cancel/update
      // できない状態が silent に発生していたため、全 instance を FAILED にして
      // calendar-sync-retry で pickup される状態にする。
      const errMsg =
        instancesResult.error ??
        (instancesResult.success && instancesResult.instances?.length === 0
          ? "fetchEventInstances returned empty"
          : "fetchEventInstances failed");
      logError(new Error(errMsg), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "syncReservationSeriesToCalendar.fetchInstances",
          seriesId,
          masterEventId,
        },
      });
      try {
        await markAllSeriesInstancesAsFailed({
          seriesId,
          error: `series ${seriesId} instances fetch failed: ${errMsg}`,
        });
      } catch (markError) {
        // marker 自体が失敗しても partial 返却は継続する (呼出側の判断材料を優先)。
        logError(normalizeError(markError), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation:
              "syncReservationSeriesToCalendar.markInstancesFailedAfterFetch",
            seriesId,
            masterEventId,
          },
        });
      }
      return {
        success: "partial",
        masterCreated: true,
        masterEventId,
        instancesWriteBack: false,
        error: errMsg,
      };
    }

    const writeBackResult = await writeBackInstanceGoogleCalendarEventIds({
      seriesId,
      instances: instancesResult.instances,
    });

    if (writeBackResult.unmatchedReservationIds.length > 0) {
      // GCAL-AUDIT-06: `matched < total` の部分成功も明示的に partial として扱い、
      // 未マッチ instance に calendarSyncError を残して retry pool に載せる
      // (旧実装は matched した分のみ書き戻し、未マッチ分は success:true の裏で
      // calendarSyncError も null のまま可視化されない状態だった)。
      const errMsg = `series ${seriesId} write-back partial: ${writeBackResult.matched}/${writeBackResult.total} instances matched`;
      logError(new Error(errMsg), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "syncReservationSeriesToCalendar.writeBackPartial",
          seriesId,
          masterEventId,
        },
      });
      await markUnmatchedSeriesInstances({
        unmatchedReservationIds: writeBackResult.unmatchedReservationIds,
        error: errMsg,
      });
      return {
        success: "partial",
        masterCreated: true,
        masterEventId,
        instancesWriteBack: false,
        error: errMsg,
      };
    }

    // 型上 eventId は string 必須 (masterEventId は既に確定した非 undefined 値)。
    // eventUrl / event は optional なので omitUndefined 経由で除去する。
    return omitUndefined({
      success: true as const,
      eventId: masterEventId,
      eventUrl: result.eventUrl,
      event: result.event,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "syncReservationSeriesToCalendar", seriesId },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
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
