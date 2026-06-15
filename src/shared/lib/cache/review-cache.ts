import "server-only";

import { updateTag } from "next/cache";

import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

type InvalidateReviewCachesOptions = {
  readonly customerId?: string;
};

/**
 * Review 投稿・削除・編集に連動するキャッシュ無効化。
 *
 * 公開スペース詳細（`/spaces/[slug]`）は `getCacheTag.spaces.detail(slug)` で
 * タグ付けされているため、レビュー平均/件数をページ内に埋め込む場合は
 * space slug ベースで無効化する。
 */
export function invalidateReviewCaches(
  spaceId: string,
  spaceSlug: string | null | undefined,
  options: InvalidateReviewCachesOptions = {},
): void {
  updateTag(CACHE_TAGS.REVIEWS);
  updateTag(getCacheTag.reviews.space(spaceId));
  updateTag(getCacheTag.reviews.stats(spaceId));
  updateTag(CACHE_TAGS.SPACES);
  if (spaceSlug) {
    updateTag(getCacheTag.spaces.detail(spaceSlug));
  }
  if (options.customerId) {
    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(getCacheTag.customers.detail(options.customerId));
  }
}
