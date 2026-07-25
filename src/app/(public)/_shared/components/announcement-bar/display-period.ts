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

export type AnnouncementBarDisplayStatus =
  "published" | "out_of_period" | "hidden";

const DISPLAY_STATUS_LABEL: Record<AnnouncementBarDisplayStatus, string> = {
  published: "公開中",
  out_of_period: "期間外",
  hidden: "非表示",
};

export function getAnnouncementBarDisplayStatusLabel(
  status: AnnouncementBarDisplayStatus,
): string {
  return DISPLAY_STATUS_LABEL[status];
}

/** 管理画面一覧: isActive + 表示期間から算出する公開状態 */
export function getAnnouncementBarDisplayStatus(
  bar: Pick<AnnouncementBarItem, "startAt" | "endAt"> & { isActive: boolean },
  now: Date,
): AnnouncementBarDisplayStatus {
  if (!bar.isActive) return "hidden";
  if (isWithinDisplayPeriod(bar, now)) return "published";
  return "out_of_period";
}
