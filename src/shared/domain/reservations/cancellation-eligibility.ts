/**
 * 顧客がキャンセル導線を出してよいかの純粋判定。`edit-eligibility.ts` の対。
 *
 * **なぜ `cancel-core.ts` から出したか（監査 A-15）。**
 * 判定は `cancel-core.ts`（`import "server-only"` + prisma を引く書込側）に同居して
 * いたため、一覧カードの表示判定 `reservation-card-deadline.ts` からは引けず、
 * 同じ規則が literal で書き直されていた。しかも書き直しのほうは
 * `paymentStatus === PENDING` の除外を落としていて、**一覧には出るのに詳細では
 * 押せない行き止まり**を作っていた。純粋な述語をここに置き、表示側と書込側の
 * 両方がここを見る。
 */

import {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { isWithinDeadline } from "./deadline";

/** キャンセル・変更を受け付ける予約ステータス */
export const CANCELLABLE_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
];

/**
 * キャンセル UI 導線を出すか（`applyCancellation` と同じ payment ガードを含む）。
 *
 * `paymentStatus === PENDING` を弾くのは、Stripe Checkout を開いたまま離脱した
 * 予約を指す。決済結果が確定していない間にキャンセルさせると、後から届く
 * `checkout.session.completed` と競合する。
 */
export function canCustomerInitiateCancellation(input: {
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  startTime: Date;
  cancellationDeadlineHours: number;
  now: Date;
}): boolean {
  if (!CANCELLABLE_STATUSES.includes(input.status)) {
    return false;
  }
  if (input.paymentStatus === PaymentStatus.PENDING) {
    return false;
  }
  return isWithinDeadline(
    input.startTime,
    input.cancellationDeadlineHours,
    input.now,
  );
}
