import type {
  CancelChannel,
  CancelRequestContext,
} from "@/shared/domain/reservations/cancellation/types";

export type BulkCancellationScope = "this-and-following" | "series-all";

export interface BulkCancellationSideEffectInput {
  /** `applyBulkCancellation`（cancel-core.ts）が確定させた claim 成功分の id 集合。 */
  reservationIds: string[];
  scope: BulkCancellationScope;
  seriesId: string;
  /**
   * どこから / 誰がキャンセルしたか (per-instance 副作用の channel + 集約 AuditLog
   * metadata に伝播)。admin / customer 経由の両方から呼ばれるため input で受け取る
   * (Phase B.2.1 Task 4)。
   */
  channel: CancelChannel;
  cancellationReason?: string;
  actorUserId?: string;
  request: CancelRequestContext;
  now: Date;
  /**
   * `this-and-following` scope の GCal master RRULE UNTIL に渡す時刻。
   * 呼出側 (`cancelReservationSeriesCommand`) が `fromInstance.startTime - 1s`
   * を計算して渡す。省略時は後方互換のため `now` にフォールバックするが、
   * `this-and-following` 経路では必ず指定すること
   * (RECENT-01: 指定しないと `now < fromInstance.startTime` のケースで GCal master
   * RRULE が cancel 実行時刻で truncate され、DB では CONFIRMED のまま残る
   * 過去 instance が GCal 上から silent に消失する)。
   */
  gcalUntil?: Date;
}
