import "server-only";

import { isRecord } from "@/shared/lib/serialize";

/**
 * `Settings.refundPolicy` の shape 定義と計算ヘルパー。
 *
 * ## Policy schema (`Settings.refundPolicy` の JSON カラムに格納)
 *
 * ```ts
 * type RefundPolicy = {
 *   tiers: Array<{ hoursBefore: number; refundRate: number (0-100) }>;
 *   defaultRefundRate: number (0-100);
 * };
 * ```
 *
 * ### 評価アルゴリズム (`calculateRefundRate`)
 *
 * 1. 現在時刻と `reservation.startTime` から「開始まで残り何時間か」(`hoursUntilStart`) を算出
 * 2. `tiers` を `hoursBefore` descending でソート (キャンセルが早いほど返金率が高い前提)
 * 3. 先頭から順に `hoursUntilStart >= tier.hoursBefore` を評価し、最初に match した
 *    `tier.refundRate` を採用
 * 4. 全 tier に match しなければ `defaultRefundRate` を採用
 * 5. 0-100 の範囲に clamp
 *
 * ## 未設定 vs 破損 (`resolveRefundPolicy`)
 *
 * - `unset` — 意図的な null / undefined。製品ポリシーどおりキャンセル時は残額全額の自動返金
 * - `invalid` — JSON shape 破損。fail-closed（自動返金しない）。ログ HIGH + 管理画面で検知
 * - `configured` — 有効な policy。tier 計算で返金額を決定
 */

/**
 * Policy tier: 「あと N 時間以内の場合は refundRate% 返金」の 1 段階。
 * hoursBefore は正整数、refundRate は 0-100 の float (小数点許容、5.5% 等も表現可)。
 */
export interface RefundPolicyTier {
  readonly hoursBefore: number;
  readonly refundRate: number;
}

/**
 * Policy 全体。`Settings.refundPolicy` の JSON schema と一致。
 */
export interface RefundPolicy {
  readonly tiers: readonly RefundPolicyTier[];
  readonly defaultRefundRate: number;
}

/**
 * `Settings.refundPolicy` の解決結果。未設定と parse 失敗を混同しない。
 */
export type RefundPolicyResolution =
  | { readonly status: "configured"; readonly policy: RefundPolicy }
  | { readonly status: "unset" }
  | { readonly status: "invalid"; readonly reason: string };

/**
 * Rate を 0-100 の範囲に clamp する (Infinity / NaN / 負数 / 100 超は全て正規化)。
 * 無効な値は 0% として扱い、over-refund を防ぐ (business-safe default)。
 */
function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  if (rate < 0) return 0;
  if (rate > 100) return 100;
  return rate;
}

/**
 * Reservation の `startTime` と現在時刻から返金率 (0-100) を算出する。
 *
 * @param policy         Settings から取得した parse 済 RefundPolicy
 * @param startTime      対象予約の `startTime` (JST 意識不要、UTC でも tz なしでも
 *                       絶対時刻同士の差分計算のみ)
 * @param now            算出時点 (通常 `new Date()`、test 用に inject 可能)
 * @returns 返金率 (0-100 の float)
 */
export function calculateRefundRate(
  policy: RefundPolicy,
  startTime: Date,
  now: Date,
): number {
  const hoursUntilStart =
    (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // 開始時刻を過ぎている (負数) は defaultRefundRate。
  // (キャンセル可能日時を過ぎている想定 — 実際には status: COMPLETED で cancel gate を通らないが
  // ここは defaultRefundRate に fallback)
  if (hoursUntilStart < 0) {
    return clampRate(policy.defaultRefundRate);
  }

  // tiers を hoursBefore desc でソート (元 array を不変で扱うため spread)。
  // 早いキャンセルほど返金率が高い前提。同 hoursBefore は最初に current match した順序を優先。
  const sortedTiers = [...policy.tiers].sort(
    (a, b) => b.hoursBefore - a.hoursBefore,
  );
  for (const tier of sortedTiers) {
    if (hoursUntilStart >= tier.hoursBefore) {
      return clampRate(tier.refundRate);
    }
  }
  return clampRate(policy.defaultRefundRate);
}

/**
 * Reservation の返金額を算出する。
 *
 * @param policy         RefundPolicy
 * @param chargedAmount  実 charge 額 (checkout で Stripe に送った額、`Reservation.totalPrice` 相当)
 * @param startTime      対象予約の `startTime`
 * @param now            算出時点
 * @returns 返金額 (円、正整数)。`chargedAmount * rate / 100` を `Math.floor` で切り捨て
 *          (over-refund 防止、小数点円は日本円で扱わない)
 */
export function calculateRefundAmount(
  policy: RefundPolicy,
  chargedAmount: number,
  startTime: Date,
  now: Date,
): number {
  const rate = calculateRefundRate(policy, startTime, now);
  return Math.floor((chargedAmount * rate) / 100);
}

/**
 * `calculateRefundAmount` の `now` を呼出時刻で確定する薄いラッパー。
 *
 * `new Date()` をこの helper 内に閉じることで、Server Component の
 * `purity` ルール（render 中の `new Date()` 直呼びを禁止）に抵触せず
 * render 中に評価できる（`coupons/_lib/coupon-status.ts` の
 * `deriveCouponStatusesNow` と同型の回避パターン）。
 */
export function calculateRefundAmountNow(
  policy: RefundPolicy,
  chargedAmount: number,
  startTime: Date,
): number {
  return calculateRefundAmount(policy, chargedAmount, startTime, new Date());
}

/**
 * `Settings.refundPolicy` の unknown JSON 値を type-safe に解決する。
 *
 * - `null` / `undefined` → `unset`（意図的な未設定）
 * - shape 違反 → `invalid`（破損。自動返金 fail-closed）
 * - 有効 → `configured`
 *
 * @param raw `Settings.refundPolicy` の JSON 値 (Prisma から来る unknown)
 */
export function resolveRefundPolicy(raw: unknown): RefundPolicyResolution {
  if (raw === null || raw === undefined) {
    return { status: "unset" };
  }

  if (!isRecord(raw)) {
    return { status: "invalid", reason: "not_object" };
  }

  const tiersRaw = raw["tiers"];
  const defaultRateRaw = raw["defaultRefundRate"];
  if (!Array.isArray(tiersRaw)) {
    return { status: "invalid", reason: "tiers_not_array" };
  }
  if (typeof defaultRateRaw !== "number") {
    return { status: "invalid", reason: "default_refund_rate_missing" };
  }
  if (!Number.isFinite(defaultRateRaw)) {
    return { status: "invalid", reason: "default_refund_rate_not_finite" };
  }

  const tiers: RefundPolicyTier[] = [];
  for (const tier of tiersRaw) {
    if (!isRecord(tier)) {
      return { status: "invalid", reason: "tier_not_object" };
    }
    const hoursBefore = tier["hoursBefore"];
    const refundRate = tier["refundRate"];
    if (typeof hoursBefore !== "number") {
      return { status: "invalid", reason: "tier_hours_before_invalid" };
    }
    if (typeof refundRate !== "number") {
      return { status: "invalid", reason: "tier_refund_rate_invalid" };
    }
    // hoursBefore は正 (0 以上)。負数だと `hoursUntilStart >= -1` が常に true になり
    // 意図した defaultRefundRate を上書きして誤返金を招くため境界で reject。
    if (!Number.isFinite(hoursBefore) || hoursBefore < 0) {
      return { status: "invalid", reason: "tier_hours_before_out_of_range" };
    }
    if (!Number.isFinite(refundRate)) {
      return { status: "invalid", reason: "tier_refund_rate_not_finite" };
    }
    tiers.push({ hoursBefore, refundRate });
  }

  return {
    status: "configured",
    policy: { tiers, defaultRefundRate: defaultRateRaw },
  };
}
