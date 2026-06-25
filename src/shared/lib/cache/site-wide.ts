/**
 * Site-wide cache invalidation helpers.
 *
 * Two contexts, two helpers:
 * - invalidateSiteWideCache: Server-Action only (updateTag — read-your-own-writes)
 * - invalidateSiteWideCacheFromRouteHandler: Route Handler / cron
 *   (revalidateTag(tag, { expire: 0 }) — blocking immediate-expire)
 *
 * Why two helpers: Next.js 16 updateTag is Server-Action-only and throws at
 * runtime in Route Handlers. Branching on caught errors is fragile. Named
 * helpers make the boundary visible at call sites.
 *
 * Why { expire: 0 } not 'max': 'max' is stale-while-revalidate. OAuth callbacks
 * redirect to admin pages that must read just-saved values — SWR breaks that.
 *
 * Sitemap auto-purge: every site-wide invalidation also enqueues a SITEMAP
 * CDN tag purge. The /sitemap.xml route is the only response that carries
 * the `sitemap-v1` tag (see next.config.ts), so the purge invalidates only
 * the sitemap document itself. This collapses Google's sitemap discovery
 * lag (~2 h s-maxage on the edge) to "next request after publish".
 * @see https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/
 */

import "server-only";
import { updateTag, revalidateTag } from "next/cache";
import {
  CDN_CACHE_TAGS,
  resolveCdnTag,
  type CdnTagValue,
} from "@/shared/lib/constants/cdn-cache-tags";
import { purgeCloudflareCacheByTags } from "@/shared/lib/cloudflare";
import { firePurgeAsync } from "@/shared/lib/cache/fire-purge";
import { queueTagPurge } from "@/shared/lib/cache/batcher";

type NextJsTagInput = string | readonly string[];

export interface InvalidateOptions {
  /** Per-detail CDN URL purge (slug-keyed). Fired alongside the tag purge. */
  cdnUrlPurge?: () => Promise<{ success: boolean; error?: string | undefined }>;
  /** Skip CDN side entirely (admin-only tags whose surfaces are private,no-store). */
  skipCdnPurge?: boolean;
}

function toArray(tags: NextJsTagInput): readonly string[] {
  return typeof tags === "string" ? [tags] : tags;
}

function translateToCdnTags(
  nextJsTags: readonly string[],
): readonly CdnTagValue[] {
  const seen = new Set<CdnTagValue>();
  for (const t of nextJsTags) {
    const cdn = resolveCdnTag(t);
    if (cdn !== null) seen.add(cdn);
  }
  return [...seen];
}

/**
 * Server-Action variant.
 * - updateTag (immediate expire, read-your-own-writes)
 * - CDN tag purge coalesced via withPurgeBatch
 * - SITEMAP tag always appended so /sitemap.xml is purged on every site-wide
 *   invalidation (Google discovery latency collapse).
 */
export function invalidateSiteWideCache(
  tags: NextJsTagInput,
  options?: InvalidateOptions,
): void {
  const nextJsTags = toArray(tags);
  for (const tag of nextJsTags) updateTag(tag);

  if (options?.skipCdnPurge) return;

  const cdnTags = translateToCdnTags(nextJsTags);
  // Always co-purge sitemap. Cheap (single tag) and admin publish → Google
  // sitemap discovery lag drops from s-maxage window to next-request.
  queueTagPurge(...cdnTags, CDN_CACHE_TAGS.SITEMAP);

  if (options?.cdnUrlPurge) {
    void firePurgeAsync(options.cdnUrlPurge, {
      operation: "invalidateSiteWideCache.cdnUrlPurge",
    });
  }
}

/**
 * Route Handler / cron variant.
 * - revalidateTag(tag, { expire: 0 }) (blocking immediate-expire)
 * - CDN tag purge fires immediately (not via batcher — Route Handlers don't wrap)
 * - SITEMAP tag always appended (same rationale as the Server-Action variant).
 */
export function invalidateSiteWideCacheFromRouteHandler(
  tags: NextJsTagInput,
  options?: InvalidateOptions,
): void {
  const nextJsTags = toArray(tags);
  for (const tag of nextJsTags) revalidateTag(tag, { expire: 0 });

  if (options?.skipCdnPurge) return;

  const cdnTags = [...translateToCdnTags(nextJsTags), CDN_CACHE_TAGS.SITEMAP];
  void firePurgeAsync(() => purgeCloudflareCacheByTags(cdnTags.slice()), {
    operation: "invalidateSiteWideCacheFromRouteHandler.tagPurge",
    tags: cdnTags,
  });

  if (options?.cdnUrlPurge) {
    void firePurgeAsync(options.cdnUrlPurge, {
      operation: "invalidateSiteWideCacheFromRouteHandler.cdnUrlPurge",
    });
  }
}

/**
 * Marketing-home tag purge.
 * Emitted only on / and /about. Called by post/news/space/event mutations.
 */
export function purgeMarketingHomeTag(): void {
  queueTagPurge(CDN_CACHE_TAGS.HOME_MARKETING);
}
