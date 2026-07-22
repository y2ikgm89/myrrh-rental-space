/**
 * お知らせバーの表示期間判定（pure function、SSoT）
 *
 * `startAt` / `endAt` と現在時刻 `now` から表示可否を判定する。`now` を引数で
 * 受けることで、呼び出し側（Server Component の `await connection()` 経路）で
 * 計算可能にし、render 中の `new Date()` 副作用を回避して React Compiler の
 * `purity` ルールに準拠する（coupon-status.ts と同型のパターン）。
 */

import type { AnnouncementBarItem } from "./types";

export function isWithinDisplayPeriod(
  bar: Pick<AnnouncementBarItem, "startAt" | "endAt">,
  now: Date,
): boolean {
  const startAt = bar.startAt ? new Date(bar.startAt) : null;
  const endAt = bar.endAt ? new Date(bar.endAt) : null;
  if (!startAt && !endAt) return true;
  if (startAt && !endAt) return now >= startAt;
  if (!startAt && endAt) return now <= endAt;
  return startAt !== null && endAt !== null && now >= startAt && now <= endAt;
}

/**
 * バー配列をサーバ現在時刻基準で表示期間フィルタする。`new Date()` をこの
 * helper 内に閉じることで、呼び出し側（Server Component）の関数本体には
 * `new Date()` が一切現れなくなる（coupon-status.ts の
 * `deriveCouponStatusesNow` と同型）。
 */
export function filterBarsWithinDisplayPeriod<
  T extends Pick<AnnouncementBarItem, "startAt" | "endAt">,
>(bars: readonly T[]): T[] {
  const now = new Date();
  return bars.filter((bar) => isWithinDisplayPeriod(bar, now));
}
