/**
 * `reservations/_lib/suggested-refund-amount.ts` のテスト（pure function）。
 *
 * 第6次監査 H-2 / M-g:
 * - 基準は Stripe への実 charge 額と同じ税込 `totalPriceWithTax`
 *   （税抜 `totalPrice` ではない）
 * - 既存返金の累計を引く（ポリシーが決めるのは総額に対する取り分であって
 *   「今回いくら返すか」ではない）
 */

import { describe, expect, test } from "bun:test";
import { calculateSuggestedRefundAmount } from "@/app/(admin)/admin/(dashboard)/reservations/_lib/suggested-refund-amount";
import type { RefundPolicyResolution } from "@/shared/domain/refund/policy";

const NOW = new Date("2026-08-15T00:00:00.000Z");

// tier / default とも 100% なので、`now` と `startTime` の関係に依存せず常に 100%。
const FULL_REFUND_POLICY: RefundPolicyResolution = {
  status: "configured",
  policy: {
    tiers: [{ hoursBefore: 0, refundRate: 100 }],
    defaultRefundRate: 100,
  },
};

// hourlyPrice 5000 × 2h、税率 10% → totalPrice 10000 / totalPriceWithTax 11000。
// 税抜の値をあえて残しておく。基準列を取り違えたら 7000 になって落ちる。
// object literal を直接渡すと余剰プロパティ検査に掛かるので const 経由で渡す。
const RESERVATION = {
  totalPrice: 10000,
  totalPriceWithTax: 11000,
  startTime: "2026-09-01T01:00:00.000Z",
  refunds: [{ amount: 1000 }, { amount: 2000 }],
};

describe("calculateSuggestedRefundAmount", () => {
  test("税込 totalPriceWithTax を基準に、既存返金の累計を引いた額を返す", () => {
    // 100% ポリシー・既返金 3000 → 11000 - 3000 = 8000。
    // この 1 つの期待値が「税抜基準なら 7000」「累計を引かなければ 11000」の
    // 両方を同時に棄却する。
    expect(
      calculateSuggestedRefundAmount(FULL_REFUND_POLICY, RESERVATION, NOW),
    ).toBe(8000);
  });
});
