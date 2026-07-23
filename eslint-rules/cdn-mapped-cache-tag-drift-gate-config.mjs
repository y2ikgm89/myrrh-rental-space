/**
 * Rule-option data for `local/no-raw-updatetag-for-cdn-mapped-cache-tag`.
 *
 * Exported from a dedicated module (not `eslint.config.mjs`) so tests can
 * import the lists without triggering ESLint plugin initialization side
 * effects.
 *
 * Both lists are drift-gated against source-of-truth files by
 * `__tests__/unit/architecture/eslint-cdn-mapped-tag-rule.test.ts`:
 * - `CDN_MAPPED_CACHE_TAGS_KEYS` must equal the identifier keys of
 *   `NEXTJS_TAG_TO_CDN_TAG` in `src/shared/lib/constants/cdn-cache-tags.ts`.
 * - Every path in `LEGACY_RAW_UPDATETAG_FILES` must still exist on disk.
 */

/**
 * CACHE_TAGS keys mapped to a CDN cache tag via NEXTJS_TAG_TO_CDN_TAG.
 * Any raw `updateTag(CACHE_TAGS.<KEY>)` / `revalidateTag(CACHE_TAGS.<KEY>)`
 * call whose <KEY> is in this list is a lint error — route through
 * invalidateSiteWideCache([...]) so Cloudflare is purged too.
 */
export const CDN_MAPPED_CACHE_TAGS_KEYS = [
  "LAYOUT_SETTINGS",
  "NAVIGATION",
  "ANNOUNCEMENT_BAR",
  "COOKIE_CONSENT",
  "ANALYTICS_CONFIG",
  "BUSINESS_SETTINGS",
  "ORGANIZATION_SETTINGS",
  "SEO_SETTINGS",
  "SOCIAL_LINKS",
  "FEATURE_MODULES",
  "INSTAGRAM_FEED",
  "PAGE_SEO",
  "PAGES",
  "PAGE_SECTIONS",
  "SECTIONS",
  "SIDEBAR_DATA",
  "SIDEBAR_SETTINGS",
  "POSTS",
  "POST_CATEGORIES",
  "POST_TAGS",
  "SPACES",
  "SPACE_CATEGORIES",
  "LOCATIONS",
  "NEWS",
  "EVENTS",
  "EVENT_WAITLIST",
  "EVENT_CATEGORIES",
  "FAQ",
  "TERMS",
  "SITEMAP",
  "INTEGRATION_SETTINGS",
];

/**
 * Files that currently violate the rule and are grandfathered until a
 * follow-up migration routes them through invalidateSiteWideCache.
 *
 * All grandfathered files migrated as of PR CACHE-DRIFT-SETTLE (final 4
 * Settings integrations). Any new violation now triggers a lint error —
 * the drift gate is fully enforced. Do NOT re-populate this list.
 */
export const LEGACY_RAW_UPDATETAG_FILES = [];
