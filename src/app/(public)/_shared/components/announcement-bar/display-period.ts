/**
 * お知らせバーの表示期間判定（pure function、SSoT）
 *
 * `startAt` / `endAt` と現在時刻 `now` から表示可否を判定する。
 *
 * **Server**: `AnnouncementBarWrapper` が `await connection()` の後に
 * `now = new Date()` で呼び出し、HTML に含める bar を request 時点で
 * 絞り込む（`'use cache'` producer 内では wall-clock を評価しない）。
 *
 * **Client**: `announcement-bar.tsx` でも毎 render 再評価する。ページ滞在中に
 * 表示期間が終了した bar を非表示にし、dismiss 状態と併用する defense-in-depth。
 * SSR/hydration 直後の `now` 食い違いによるごく稀な hydration mismatch は
 * CopyrightYear.tsx 等と同種の許容済みリスク。
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

/** `connection()` 後の Server Component から呼ぶ request-time 絞り込み */
export function filterBarsWithinDisplayPeriodNow<
  T extends Pick<AnnouncementBarItem, "startAt" | "endAt">,
>(bars: readonly T[]): T[] {
  const now = new Date();
  return bars.filter((bar) => isWithinDisplayPeriod(bar, now));
}
