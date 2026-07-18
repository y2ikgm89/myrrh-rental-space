import "server-only";

import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";

/**
 * イベント関連キャッシュを無効化する。
 *
 * イベント公開ページ（一覧・詳細）の cacheTag は collection タグ
 * `CACHE_TAGS.EVENTS` 一つのため、これだけで全イベントページが更新される。
 *
 * CACHE-INVALIDATE-04: 単なる `updateTag` では Cloudflare CDN edge に伝播せず、
 * `/events/:path*` に emit された `event-v1` Cache-Tag が最大 s-maxage=3600 秒
 * stale で配信され続ける。`invalidateSiteWideCache` 経由で updateTag (Next.js
 * Data Cache) + queueTagPurge (Cloudflare CDN) + sitemap 自動 purge を一括発火
 * させる (SSoT: .claude/rules/caching.md、reference: space-category.ts /
 * instagram.ts の CACHE-INVALIDATE-02/03 と同型)。
 */
export function invalidateEventCaches(): void {
  invalidateSiteWideCache(CACHE_TAGS.EVENTS);
}
