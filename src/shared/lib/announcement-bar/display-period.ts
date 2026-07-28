/**
 * お知らせバーの表示期間判定（pure function、SSoT）
 *
 * public / admin 双方から参照するため shared に配置。
 */

export type AnnouncementBarDisplayWindow = {
  readonly startAt?: string | null;
  readonly endAt?: string | null;
};

export function isWithinDisplayPeriod(
  bar: AnnouncementBarDisplayWindow,
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
  T extends AnnouncementBarDisplayWindow,
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
  bar: AnnouncementBarDisplayWindow & { isActive: boolean },
  now: Date,
): AnnouncementBarDisplayStatus {
  if (!bar.isActive) return "hidden";
  if (isWithinDisplayPeriod(bar, now)) return "published";
  return "out_of_period";
}
