import { describe, test, expect } from "bun:test";
import {
  CDN_CACHE_TAGS,
  SITE_WIDE_CDN_TAGS,
  SIDEBAR_CDN_TAGS,
  joinCacheTags,
  resolveCdnTag,
  NEXTJS_TAG_TO_CDN_TAG,
  NEXTJS_TAGS_WITHOUT_CDN_MAPPING,
} from "@/shared/lib/constants/cdn-cache-tags";
import { CACHE_TAGS } from "@/shared/lib/constants/cache";

const VALID = /^[\x21-\x2B\x2D-\x7E]+$/;

describe("CDN_CACHE_TAGS invariants", () => {
  test("every value is printable ASCII, no space, no comma", () => {
    for (const [key, value] of Object.entries(CDN_CACHE_TAGS)) {
      expect(VALID.test(value), `${key}=${value}`).toBe(true);
    }
  });

  test("every value is <=1024 chars", () => {
    for (const value of Object.values(CDN_CACHE_TAGS)) {
      expect(value.length).toBeLessThanOrEqual(1024);
    }
  });

  test("every value has -v1 suffix", () => {
    for (const [key, value] of Object.entries(CDN_CACHE_TAGS)) {
      expect(value, key).toMatch(/-v\d+$/);
    }
  });

  test("SITE_WIDE_CDN_TAGS is subset of CDN_CACHE_TAGS values", () => {
    const all = new Set<string>(Object.values(CDN_CACHE_TAGS));
    for (const tag of SITE_WIDE_CDN_TAGS) expect(all.has(tag)).toBe(true);
  });

  test("SIDEBAR_CDN_TAGS is subset of CDN_CACHE_TAGS values", () => {
    const all = new Set<string>(Object.values(CDN_CACHE_TAGS));
    for (const tag of SIDEBAR_CDN_TAGS) expect(all.has(tag)).toBe(true);
  });

  test("HOME_MARKETING is NOT in SITE_WIDE_CDN_TAGS (scoped to / and /about)", () => {
    const siteWideTags = new Set<unknown>(SITE_WIDE_CDN_TAGS);
    expect(siteWideTags.has(CDN_CACHE_TAGS.HOME_MARKETING)).toBe(false);
  });
});

describe("joinCacheTags", () => {
  test("dedupes and joins with comma", () => {
    const out = joinCacheTags([
      CDN_CACHE_TAGS.LAYOUT,
      CDN_CACHE_TAGS.LAYOUT,
      CDN_CACHE_TAGS.NAVIGATION,
    ]);
    expect(out).toBe("layout-v1,navigation-v1");
  });

  test("full site-wide set is well under 16 KB", () => {
    const out = joinCacheTags(SITE_WIDE_CDN_TAGS);
    expect(Buffer.byteLength(out, "utf8")).toBeLessThan(16 * 1024);
  });
});

describe("resolveCdnTag", () => {
  test("maps known Next.js tag strings to CDN tags", () => {
    expect(resolveCdnTag(CACHE_TAGS.LAYOUT_SETTINGS)).toBe(
      CDN_CACHE_TAGS.LAYOUT,
    );
    expect(resolveCdnTag(CACHE_TAGS.NAVIGATION)).toBe(
      CDN_CACHE_TAGS.NAVIGATION,
    );
    expect(resolveCdnTag(CACHE_TAGS.POSTS)).toBe(CDN_CACHE_TAGS.POST);
    expect(resolveCdnTag(CACHE_TAGS.SPACES)).toBe(CDN_CACHE_TAGS.SPACE);
    expect(resolveCdnTag(CACHE_TAGS.SITEMAP)).toBe(CDN_CACHE_TAGS.SITEMAP);
    expect(resolveCdnTag(CACHE_TAGS.INTEGRATION_SETTINGS)).toBe(
      CDN_CACHE_TAGS.INTEGRATION_SETTINGS,
    );
  });

  test("returns null for per-detail (slug-keyed) tags", () => {
    expect(resolveCdnTag("posts-some-slug")).toBeNull();
  });

  test("NEXTJS_TAG_TO_CDN_TAG values are all in CDN_CACHE_TAGS", () => {
    const all = new Set<string>(Object.values(CDN_CACHE_TAGS));
    for (const value of Object.values(NEXTJS_TAG_TO_CDN_TAG)) {
      expect(all.has(value)).toBe(true);
    }
  });

  test("every CACHE_TAGS value is either mapped OR on the allowlist (rail against drift)", () => {
    const mapped = new Set<string>(Object.keys(NEXTJS_TAG_TO_CDN_TAG));
    const allowlist = new Set<string>(NEXTJS_TAGS_WITHOUT_CDN_MAPPING);
    for (const [key, value] of Object.entries(CACHE_TAGS)) {
      expect(
        mapped.has(value) || allowlist.has(value),
        `CACHE_TAGS.${key} (="${value}") is neither mapped nor allowlisted`,
      ).toBe(true);
    }
  });
});
