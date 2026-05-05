/**
 * クーポン表示ステータスの導出（pure function、SSoT）
 *
 * `validFrom` / `validUntil` 等のレコード値と現在時刻 `now` から、UI 表示用の
 * 派生ステータス（`active` / `inactive` / `expired` / `limitReached` / `notStarted`）
 * を計算する。`now` を引数で受けることで、Server Component の `await connection()`
 * 経路で計算可能（render 中の `new Date()` 副作用を回避し React Compiler の
 * `purity` ルールに準拠）。
 */

export const COUPON_STATUS_TYPES = [
  "active",
  "inactive",
  "expired",
  "limitReached",
  "notStarted",
] as const;

export type CouponStatusType = (typeof COUPON_STATUS_TYPES)[number];

/**
 * `getCouponStatus()` の入力に必要な最小プロパティ（`CouponData` のサブセット）。
 * Date は ISO 8601 文字列（`toPlainObject()` 通過後）を想定。
 */
export type CouponStatusInput = {
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  usageLimit: number | null;
  usageCount: number;
};

/**
 * クーポンの現在時刻 `now` 基準の表示ステータスを返す（pure function）。
 *
 * 優先順位:
 * 1. `isActive: false` → `inactive`
 * 2. `validFrom > now` → `notStarted`（開始前）
 * 3. `validUntil < now` → `expired`（期限切れ）
 * 4. `usageCount >= usageLimit` → `limitReached`（上限到達）
 * 5. それ以外 → `active`
 */
export function getCouponStatus(
  coupon: CouponStatusInput,
  now: Date,
): CouponStatusType {
  if (!coupon.isActive) return "inactive";
  if (new Date(coupon.validFrom) > now) return "notStarted";
  if (coupon.validUntil && new Date(coupon.validUntil) < now) return "expired";
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return "limitReached";
  }
  return "active";
}

/**
 * クーポン配列にサーバ現在時刻基準の派生ステータスを埋め込む。
 *
 * `new Date()` をこの helper 内に閉じることで、Server Component の `purity`
 * lint（`@eslint-react/purity`）を回避する（lint は Component context 内の
 * `new Date()` のみ検出し、別ファイルの helper 関数は対象外という公式仕様）。
 *
 * 呼び出し側（page.tsx）は `await connection()` の後にこの関数を呼び、
 * リクエスト単位で確定した時刻基準で派生ステータスを得る。
 */
export function deriveCouponStatusesNow<T extends CouponStatusInput>(
  coupons: readonly T[],
): readonly (T & { status: CouponStatusType })[] {
  const now = new Date();
  return coupons.map((coupon) => ({
    ...coupon,
    status: getCouponStatus(coupon, now),
  }));
}

/**
 * 単一クーポンに対するサーバ現在時刻基準の派生ステータス埋め込み。
 * `deriveCouponStatusesNow` の単一版（`new Date()` は同じ理由で helper に閉じる）。
 */
export function deriveCouponStatusNow<T extends CouponStatusInput>(
  coupon: T,
): T & { status: CouponStatusType } {
  return { ...coupon, status: getCouponStatus(coupon, new Date()) };
}
