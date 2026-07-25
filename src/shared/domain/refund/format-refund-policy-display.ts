import type { RefundPolicy } from "@/shared/domain/refund/policy";

function formatRefundRatePercent(rate: number): string {
  if (!Number.isFinite(rate)) return "0%";
  const normalized = Math.min(100, Math.max(0, rate));
  if (Number.isInteger(normalized)) {
    return `${normalized}%`;
  }
  return `${normalized.toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * 公開サイト向けに RefundPolicy を表示用の箇条書きテキストに変換する。
 * tiers は `calculateRefundRate` と同じ hoursBefore 降順で並べる。
 */
export function formatRefundPolicyDisplayLines(
  policy: RefundPolicy,
): readonly string[] {
  const sortedTiers = [...policy.tiers].sort(
    (a, b) => b.hoursBefore - a.hoursBefore,
  );

  const tierLines = sortedTiers.map(
    (tier) =>
      `利用開始の${tier.hoursBefore}時間以上前: ${formatRefundRatePercent(tier.refundRate)}返金`,
  );

  return [
    ...tierLines,
    `上記に該当しない場合: ${formatRefundRatePercent(policy.defaultRefundRate)}返金`,
  ];
}
