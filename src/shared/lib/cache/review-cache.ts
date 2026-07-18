import "server-only";

import { updateTag } from "next/cache";

import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
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
 *
 * CACHE-INVALIDATE-05: `CACHE_TAGS.SPACES` は CDN mapped (`space-v1`) のため
 * 単なる `updateTag` では Cloudflare edge に伝播せず、`/spaces` と
 * `/spaces/[slug]` に emit された `space-v1` Cache-Tag が最大 s-maxage 秒
 * stale で配信され続ける。SPACES と slug 詳細タグを `invalidateSiteWideCache`
 * 経由に切り替え、updateTag (Next.js Data Cache) + queueTagPurge (Cloudflare
 * CDN) + sitemap 自動 co-purge を一括発火する
 * (SSoT: `.claude/rules/caching.md`、reference: event-cache.ts の
 * CACHE-INVALIDATE-04 と同型)。REVIEWS / CUSTOMERS は
 * `NEXTJS_TAGS_WITHOUT_CDN_MAPPING` の admin-only tag のため raw `updateTag`
 * のまま。
 */
export function invalidateReviewCaches(
  spaceId: string,
  spaceSlug: string | null | undefined,
  options: InvalidateReviewCachesOptions = {},
): void {
  // Admin-only (no CDN mapping): reviews collection + per-space sub-tags.
  updateTag(CACHE_TAGS.REVIEWS);
  updateTag(getCacheTag.reviews.space(spaceId));
  updateTag(getCacheTag.reviews.stats(spaceId));

  // Public-facing: SPACES (CDN mapped -> space-v1). Route through
  // invalidateSiteWideCache so Next.js Data Cache and Cloudflare CDN edge
  // (space-v1 + sitemap-v1 co-purge) stay in lockstep.
  const spaceTags: string[] = [CACHE_TAGS.SPACES];
  if (spaceSlug) {
    spaceTags.push(getCacheTag.spaces.detail(spaceSlug));
  }
  invalidateSiteWideCache(spaceTags);

  if (options.customerId) {
    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(getCacheTag.customers.detail(options.customerId));
  }
}
