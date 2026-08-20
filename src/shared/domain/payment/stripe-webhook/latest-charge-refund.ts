/**
 * `charge.refunded` の Refund child を 1 件選ぶ。
 *
 * Stripe 公式は Charge 上の `refunds` を「新しい順」の list と定め、既定で
 * 最新 10 件が入る（https://docs.stripe.com/api/refunds/list）。`data[0]` は
 * その前提では最新。webhook 展開が順不同でも同じ結果になるよう `created`
 * の最大を取る。
 */
export function pickLatestChargeRefund<T extends { readonly created: number }>(
  refunds: { readonly data?: readonly T[] } | null | undefined,
): T | undefined {
  const data = refunds?.data ?? [];
  if (data.length === 0) return undefined;

  return data.reduce((latest, item) =>
    item.created > latest.created ? item : latest,
  );
}
