/**
 * 管理画面の返金ダイアログに出す「ポリシー推奨額」の導出（pure function）。
 *
 * 2 つの基準を呼出側に選ばせない:
 *
 * 1. **基準は税込 `totalPriceWithTax`。** Stripe への実 charge 額がこれで、
 *    `refundReservationPaymentCommand` の返金上限も同じ列を使う。税抜
 *    `totalPrice` を基準にすると税額分だけ少ない額が推奨され、残額を超えないため
 *    client / server どちらの検査にも掛からず無警告で確定する。
 * 2. **既存の返金累計を引く。** ポリシーが決めるのは総額に対する取り分であって
 *    「今回いくら返すか」ではない。自動返金と同じ
 *    `calculatePolicyRefundBreakdown` を使う。
 *
 * `now` を引数で受ける pure 版と `new Date()` を閉じ込めた `...Now` 版に分けるのは
 * `coupons/_lib/coupon-status.ts` と同じ理由（Server Component の render 中に
 * `new Date()` を直呼びしない）。
 */

import {
  calculatePolicyRefundBreakdown,
  type RefundPolicyResolution,
} from "@/shared/domain/refund/policy";

/** `ReservationWithRelations` のうち推奨額算出に要る部分だけ。 */
export type SuggestedRefundReservation = {
  readonly totalPriceWithTax: number | null;
  readonly startTime: string;
  readonly refunds?: readonly { readonly amount: number }[];
};

/** ポリシー推奨額（円）。policy 未設定 / 破損なら null（ダイアログに出さない）。 */
export function calculateSuggestedRefundAmount(
  resolution: RefundPolicyResolution,
  reservation: SuggestedRefundReservation,
  now: Date,
): number | null {
  if (resolution.status !== "configured") {
    return null;
  }
  const refundedSoFar = (reservation.refunds ?? []).reduce(
    (sum, refund) => sum + refund.amount,
    0,
  );
  return calculatePolicyRefundBreakdown(
    resolution.policy,
    reservation.totalPriceWithTax ?? 0,
    refundedSoFar,
    new Date(reservation.startTime),
    now,
  ).outstanding;
}

/** `calculateSuggestedRefundAmount` の `now` を呼出時刻で確定する薄いラッパー。 */
export function calculateSuggestedRefundAmountNow(
  resolution: RefundPolicyResolution,
  reservation: SuggestedRefundReservation,
): number | null {
  return calculateSuggestedRefundAmount(resolution, reservation, new Date());
}
