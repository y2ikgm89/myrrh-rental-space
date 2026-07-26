/**
 * News の公開可視性（管理 UI バッジ / フィルター / PublishSwitch ラベル用）。
 *
 * 公開サイトの `publicNewsWhere()` と揃え、PUBLISHED = 現在ライブ露出中
 * （`isPublished` かつ `publishedAt <= now`）。未来の `publishedAt` は予約公開。
 * Client Component からも import 可能な pure helper（`server-only` なし）。
 */

export type NewsPublishVisibility = "draft" | "scheduled" | "published";

export const NEWS_PUBLISH_VISIBILITY_LABELS: Record<
  NewsPublishVisibility,
  string
> = {
  draft: "下書き",
  scheduled: "予約公開",
  published: "公開中",
};

function toPublishedAtDate(publishedAt: string | Date | null): Date | null {
  if (publishedAt == null) return null;
  if (publishedAt instanceof Date) return publishedAt;
  const parsed = new Date(publishedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * 管理画面向けの公開可視性を導出する。
 *
 * - draft: `isPublished === false`
 * - scheduled: 公開フラグ ON かつ `publishedAt` が未来
 * - published: 公開フラグ ON かつ（`publishedAt` なし / 過去・現在）
 *
 * `isPublished && publishedAt == null` は公開サイトでは露出しないが、
 * 保存経路では通常 `publishedAt` が補完される。バッジはスイッチ ON と揃えて
 * published 扱い（フィルターの PUBLISHED は `publishedAt <= now` で null を除外）。
 */
export function getNewsPublishVisibility(
  isPublished: boolean,
  publishedAt: string | Date | null,
  now: Date = new Date(),
): NewsPublishVisibility {
  if (!isPublished) {
    return "draft";
  }

  const at = toPublishedAtDate(publishedAt);
  if (at != null && at.getTime() > now.getTime()) {
    return "scheduled";
  }

  return "published";
}
