/**
 * Cloudflare CDN Cache-Tag SSoT
 *
 * Disjoint from CACHE_TAGS (Next.js Data Cache tags).
 * - CACHE_TAGS: cacheTag() / updateTag() / revalidateTag() — origin in-process cache
 * - CDN_CACHE_TAGS: HTTP Cache-Tag header values + Cloudflare purge_by_tags
 *
 * Cloudflare official constraints:
 * - Per-tag printable ASCII, no space, no comma (commas separate tags in the header).
 * - Per-tag max 1024 chars.
 * - Aggregate Cache-Tag header value max 16 KB.
 * - Cloudflare strips Cache-Tag from the response before delivery on plans that
 *   support it (Enterprise traditionally; the April 2025 changelog opened tag purge
 *   API access to all plans, but origin header HONORING is still plan-tier dependent).
 *   Our runtime health probe (cache/health.ts) detects and downgrades to URL-only purge.
 *
 * Versioning policy (-v1 suffix):
 * - All tags carry -v1 today.
 * - On incompatible schema change: add -v2 alongside; emit BOTH for 1× s-maxage
 *   window; drop -v1 after window. Decouples one breaking change from a global flush.
 *
 * @see https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-tags/
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/headers
 */

import { CACHE_TAGS } from "./cache";

/** Branded CDN cache tag string type. */
export type CdnCacheTag = string & { readonly __brand: "CdnCacheTag" };

function asCdnTag<T extends string>(value: T): T & CdnCacheTag {
  return value as T & CdnCacheTag;
}

export const CDN_CACHE_TAGS = {
  // --- Site-wide (emitted on every public source entry) ---
  LAYOUT: asCdnTag("layout-v1"),
  NAVIGATION: asCdnTag("navigation-v1"),
  ANNOUNCEMENT_BAR: asCdnTag("announcement-bar-v1"),
  COOKIE_CONSENT: asCdnTag("cookie-consent-v1"),
  ANALYTICS_CONFIG: asCdnTag("analytics-config-v1"),
  BUSINESS_SETTINGS: asCdnTag("business-settings-v1"),
  ORGANIZATION_SETTINGS: asCdnTag("organization-settings-v1"),
  SEO_SETTINGS: asCdnTag("seo-settings-v1"),
  SOCIAL_LINKS: asCdnTag("social-links-v1"),
  TERMS_FOOTER: asCdnTag("terms-footer-v1"),
  FEATURE_MODULES: asCdnTag("feature-modules-v1"),
  PAGE: asCdnTag("page-v1"),
  PAGE_SECTIONS: asCdnTag("page-sections-v1"),
  PAGE_SEO: asCdnTag("page-seo-v1"),
  INSTAGRAM_FEED: asCdnTag("instagram-feed-v1"),

  // --- Marketing aggregation (scoped to / and /about only) ---
  HOME_MARKETING: asCdnTag("home-marketing-v1"),

  // --- Per-collection ---
  POST: asCdnTag("post-v1"),
  POST_CATEGORY: asCdnTag("post-category-v1"),
  POST_TAG: asCdnTag("post-tag-v1"),
  SPACE: asCdnTag("space-v1"),
  SPACE_CATEGORY: asCdnTag("space-category-v1"),
  LOCATION: asCdnTag("location-v1"),
  NEWS: asCdnTag("news-v1"),
  EVENT: asCdnTag("event-v1"),
  FAQ: asCdnTag("faq-v1"),
  TERMS_DETAIL: asCdnTag("terms-detail-v1"),
  SITEMAP: asCdnTag("sitemap-v1"),

  // --- BlogLayout sidebar ---
  SIDEBAR_DATA: asCdnTag("sidebar-data-v1"),
  SIDEBAR_SETTINGS: asCdnTag("sidebar-settings-v1"),

  // --- Admin-only (no Cache-Tag header emission; purge is a no-op for these) ---
  INTEGRATION_SETTINGS: asCdnTag("integration-settings-v1"),
} as const;

export type CdnTagValue = (typeof CDN_CACHE_TAGS)[keyof typeof CDN_CACHE_TAGS];

/**
 * Tags emitted on every public source entry (collection-specific sources inline these).
 * Marketing aggregation HOME_MARKETING is NOT in this set — it's scoped to / and /about.
 */
export const SITE_WIDE_CDN_TAGS = [
  CDN_CACHE_TAGS.LAYOUT,
  CDN_CACHE_TAGS.NAVIGATION,
  CDN_CACHE_TAGS.ANNOUNCEMENT_BAR,
  CDN_CACHE_TAGS.COOKIE_CONSENT,
  CDN_CACHE_TAGS.ANALYTICS_CONFIG,
  CDN_CACHE_TAGS.BUSINESS_SETTINGS,
  CDN_CACHE_TAGS.ORGANIZATION_SETTINGS,
  CDN_CACHE_TAGS.SEO_SETTINGS,
  CDN_CACHE_TAGS.SOCIAL_LINKS,
  CDN_CACHE_TAGS.TERMS_FOOTER,
  CDN_CACHE_TAGS.FEATURE_MODULES,
  CDN_CACHE_TAGS.PAGE,
  CDN_CACHE_TAGS.PAGE_SECTIONS,
  CDN_CACHE_TAGS.PAGE_SEO,
  CDN_CACHE_TAGS.INSTAGRAM_FEED,
] as const satisfies readonly CdnTagValue[];

export const SIDEBAR_CDN_TAGS = [
  CDN_CACHE_TAGS.SIDEBAR_DATA,
  CDN_CACHE_TAGS.SIDEBAR_SETTINGS,
] as const satisfies readonly CdnTagValue[];

/**
 * Next.js cache tag → CDN tag mapping. Keys are CACHE_TAGS *constants* (not raw
 * string literals) so a rename in cache.ts breaks compilation here, not silently
 * at runtime.
 *
 * Tags intentionally absent from this mapping (use URL purge or are admin-only):
 * - REVIEWS (id-keyed sub-tags, purged via space detail URL)
 * - RESERVATIONS, CUSTOMERS, INQUIRIES, POST_COMMENTS, MEDIA, STAFF, COUPONS,
 *   NOTIFICATION_SETTINGS, BLOCK_TEMPLATES (admin-only, private,no-store)
 */
export const NEXTJS_TAG_TO_CDN_TAG = {
  // Site-wide settings
  [CACHE_TAGS.LAYOUT_SETTINGS]: CDN_CACHE_TAGS.LAYOUT,
  [CACHE_TAGS.NAVIGATION]: CDN_CACHE_TAGS.NAVIGATION,
  [CACHE_TAGS.ANNOUNCEMENT_BAR]: CDN_CACHE_TAGS.ANNOUNCEMENT_BAR,
  [CACHE_TAGS.COOKIE_CONSENT]: CDN_CACHE_TAGS.COOKIE_CONSENT,
  [CACHE_TAGS.ANALYTICS_CONFIG]: CDN_CACHE_TAGS.ANALYTICS_CONFIG,
  [CACHE_TAGS.BUSINESS_SETTINGS]: CDN_CACHE_TAGS.BUSINESS_SETTINGS,
  [CACHE_TAGS.ORGANIZATION_SETTINGS]: CDN_CACHE_TAGS.ORGANIZATION_SETTINGS,
  [CACHE_TAGS.SEO_SETTINGS]: CDN_CACHE_TAGS.SEO_SETTINGS,
  [CACHE_TAGS.SOCIAL_LINKS]: CDN_CACHE_TAGS.SOCIAL_LINKS,
  [CACHE_TAGS.FEATURE_MODULES]: CDN_CACHE_TAGS.FEATURE_MODULES,
  [CACHE_TAGS.INSTAGRAM_FEED]: CDN_CACHE_TAGS.INSTAGRAM_FEED,
  [CACHE_TAGS.PAGE_SEO]: CDN_CACHE_TAGS.PAGE_SEO,

  // Pages / sections (PAGES and PAGE_SECTIONS map to distinct CDN tags;
  // SECTIONS aliases to PAGE_SECTIONS since they share an emission scope)
  [CACHE_TAGS.PAGES]: CDN_CACHE_TAGS.PAGE,
  [CACHE_TAGS.PAGE_SECTIONS]: CDN_CACHE_TAGS.PAGE_SECTIONS,
  [CACHE_TAGS.SECTIONS]: CDN_CACHE_TAGS.PAGE_SECTIONS,

  // BlogLayout sidebar
  [CACHE_TAGS.SIDEBAR_DATA]: CDN_CACHE_TAGS.SIDEBAR_DATA,
  [CACHE_TAGS.SIDEBAR_SETTINGS]: CDN_CACHE_TAGS.SIDEBAR_SETTINGS,

  // Per-collection
  [CACHE_TAGS.POSTS]: CDN_CACHE_TAGS.POST,
  [CACHE_TAGS.POST_CATEGORIES]: CDN_CACHE_TAGS.POST_CATEGORY,
  [CACHE_TAGS.POST_TAGS]: CDN_CACHE_TAGS.POST_TAG,
  [CACHE_TAGS.SPACES]: CDN_CACHE_TAGS.SPACE,
  [CACHE_TAGS.SPACE_CATEGORIES]: CDN_CACHE_TAGS.SPACE_CATEGORY,
  [CACHE_TAGS.LOCATIONS]: CDN_CACHE_TAGS.LOCATION,
  [CACHE_TAGS.NEWS]: CDN_CACHE_TAGS.NEWS,
  [CACHE_TAGS.EVENTS]: CDN_CACHE_TAGS.EVENT,
  [CACHE_TAGS.FAQ]: CDN_CACHE_TAGS.FAQ,
  [CACHE_TAGS.TERMS]: CDN_CACHE_TAGS.TERMS_DETAIL,
  [CACHE_TAGS.SITEMAP]: CDN_CACHE_TAGS.SITEMAP,

  // Admin-only (skipCdnPurge:true callers; mapping exists for type-cleanliness)
  [CACHE_TAGS.INTEGRATION_SETTINGS]: CDN_CACHE_TAGS.INTEGRATION_SETTINGS,
} as const satisfies Record<string, CdnTagValue>;

/**
 * Next.js tags intentionally NOT in NEXTJS_TAG_TO_CDN_TAG.
 * - Admin-only (no public cached render)
 * - id-keyed sub-tag scheme (purged via per-detail URL)
 * Used by the architecture-boundaries test as the allowlist.
 */
export const NEXTJS_TAGS_WITHOUT_CDN_MAPPING = [
  CACHE_TAGS.RESERVATIONS,
  CACHE_TAGS.CUSTOMERS,
  CACHE_TAGS.INQUIRIES,
  CACHE_TAGS.POST_COMMENTS,
  CACHE_TAGS.MEDIA,
  CACHE_TAGS.STAFF,
  CACHE_TAGS.COUPONS,
  CACHE_TAGS.NOTIFICATION_SETTINGS,
  CACHE_TAGS.BLOCK_TEMPLATES,
  CACHE_TAGS.REVIEWS,
  // sendEmail() の suppression bulk lookup ('use cache' + tag) 専用。
  // server-only な email 送信経路でのみ消費され、Cloudflare CDN edge には
  // 一切露出しない (/api/webhooks/resend は private,no-store)。
  CACHE_TAGS.SUPPRESSED_EMAILS,
] as const;

export const PRIVATE_NO_TAG_PREFIXES = [
  "/admin",
  "/reservation",
  "/mypage",
  "/login",
  "/preview",
  "/contact",
  "/api",
] as const;

/**
 * Printable ASCII excluding 0x20 (space), 0x2C (comma), 0x7F (DEL).
 * - 0x21-0x2B: '!' through '+'
 * - 0x2D-0x7E: '-' through '~'
 */
const VALID_TAG_PATTERN = /^[\x21-\x2B\x2D-\x7E]+$/;

export function joinCacheTags(tags: readonly CdnTagValue[]): string {
  const seen = new Set<string>();
  for (const tag of tags) {
    if (!VALID_TAG_PATTERN.test(tag)) {
      throw new Error(
        `Invalid CDN cache tag (printable ASCII, no space/comma): ${JSON.stringify(tag)}`,
      );
    }
    if (tag.length > 1024) {
      throw new Error(
        `CDN cache tag exceeds Cloudflare 1024-char limit: ${tag.length} chars`,
      );
    }
    seen.add(tag);
  }
  const value = [...seen].join(",");
  if (Buffer.byteLength(value, "utf8") > 16 * 1024) {
    throw new Error(
      `Joined Cache-Tag value exceeds 16 KB: ${Buffer.byteLength(value, "utf8")} bytes`,
    );
  }
  return value;
}

export function resolveCdnTag(nextJsTag: string): CdnTagValue | null {
  return (
    (NEXTJS_TAG_TO_CDN_TAG as Record<string, CdnTagValue>)[nextJsTag] ?? null
  );
}
