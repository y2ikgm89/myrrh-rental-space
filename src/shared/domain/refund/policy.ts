import "server-only";

import { isRecord } from "@/shared/lib/serialize";

/**
 * `Settings.refundPolicy` の shape 定義と計算ヘルパー (task #9 PR#5 domain 部分)。
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
 * ### 例
 *
 * ```json
 * {
 *   "tiers": [
 *     { "hoursBefore": 168, "refundRate": 100 },  // 7 日 (168 時間) 前まで: 全額
 *     { "hoursBefore": 72,  "refundRate": 50  }   // 3 日 (72 時間) 前まで: 半額
 *   ],
 *   "defaultRefundRate": 0                          // それ以降: 返金不可
 * }
 * ```
 *
 * ## 未設定時の挙動 (`parseRefundPolicy` が null を返す場合)
 *
 * 呼出側は「policy 未設定」として扱い、現状の「auto refund は残額全額」動作を維持する。
 * NULL / shape 不正の両方を同一分岐に集約するため `parseRefundPolicy` は返り値 null を
 * 使う (throw しない、fail-open で running system の robustness を保つ)。
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
 * Rate を 0-100 の範囲に clamp する (Infinity / NaN / 負数 / 100 超は全て正規化)。
 * fail-open 設計: 無効な値は 0% として扱い、over-refund を防ぐ (business-safe default)。
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
  // ここは fail-open で defaultRefundRate に fallback)
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
 * `Settings.refundPolicy` の unknown JSON 値を type-safe に parse する。
 *
 * ## fail-open 設計
 * shape 違反 (フィールド欠落 / 型不一致 / 配列でない等) は `null` を返す。
 * 呼出側は null を「policy 未設定」として扱い、現状挙動 (auto refund は残額全額) に fallback。
 * throw しないのは、Settings 側の JSON 手入力による部分的破損で refund 経路全体が
 * 500 化するのを防ぐため (business continuity 優先)。
 *
 * @param raw `Settings.refundPolicy` の JSON 値 (Prisma から来る unknown)
 * @returns 有効な RefundPolicy、または `null` (未設定 / shape 不正)
 */
export function parseRefundPolicy(raw: unknown): RefundPolicy | null {
  if (!isRecord(raw)) return null;

  const tiersRaw = raw["tiers"];
  const defaultRateRaw = raw["defaultRefundRate"];
  if (!Array.isArray(tiersRaw)) return null;
  if (typeof defaultRateRaw !== "number") return null;
  // Codex P2 (PR #1134): defaultRefundRate も finite check で NaN / Infinity を reject。
  // clamp は `calculateRefundRate` で 0-100 に normalize されるが parse 境界で早期 reject
  // することで shape 破壊状態の Settings 全体を「未設定」扱いに fall back させる。
  if (!Number.isFinite(defaultRateRaw)) return null;

  const tiers: RefundPolicyTier[] = [];
  for (const tier of tiersRaw) {
    if (!isRecord(tier)) return null;
    const hoursBefore = tier["hoursBefore"];
    const refundRate = tier["refundRate"];
    if (typeof hoursBefore !== "number") return null;
    if (typeof refundRate !== "number") return null;
    // Codex P2 (PR #1134, comment 3589594663): 契約上 hoursBefore は正 (0 以上)。
    // 手入力 JSON で -1 等が入ると `hoursUntilStart >= -1` が常に true になり、
    // 意図した defaultRefundRate を上書きして誤返金を招くため境界で reject。
    // Infinity / NaN も同時に排除 (`calculateRefundRate` の sort が非決定的になる)。
    if (!Number.isFinite(hoursBefore) || hoursBefore < 0) return null;
    if (!Number.isFinite(refundRate)) return null;
    tiers.push({ hoursBefore, refundRate });
  }

  return { tiers, defaultRefundRate: defaultRateRaw };
}
