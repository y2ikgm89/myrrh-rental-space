/**
 * sitemap() 統合テスト。
 *
 * mock.module で `getSitemapContentData` と `getFeatureFilterContext` を差し替え、
 * fixture を変えながら sitemap entry の不変条件を検証する。
 *
 * 検証対象（改善 1〜6 の回帰防止）:
 * - URL uniqueness
 * - BASE_URL 前置整合（`//` 不在 / すべて BASE_URL から始まる）
 * - STATIC_PAGES は systemPageLastModified Map から駆動（DB 不在は省略）
 * - listing 空 collection 時の省略（new Date() フォールバック撤去）
 * - feature OFF 時の listing + detail の同時消滅
 * - customPages の disabledPageSlugs ＋ isReservedPath フィルタ
 * - encodeURIComponent（マルチバイト slug が壊れず emit）
 * - catastrophic 失敗時の STATIC_PAGES-only フォールバック
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { FeatureFilterContext } from "@/shared/lib/features/check";
import type { FeatureModule } from "@/shared/lib/features/registry";

const BASE_URL = "https://example.com";
process.env["NEXT_PUBLIC_BASE_URL"] = BASE_URL;
process.env["NEXT_PUBLIC_APP_URL"] = BASE_URL;

type ContentData = {
  spaces: { slug: string; updatedAt: Date }[];
  news: { slug: string; updatedAt: Date }[];
  posts: {
    slug: string;
    updatedAt: Date;
    publishedAt: Date | null;
    category: { slug: string } | null;
  }[];
  postCategories: { slug: string; updatedAt: Date }[];
  postTags: { slug: string; updatedAt: Date }[];
  customPages: { slug: string; updatedAt: Date }[];
  events: { slug: string; updatedAt: Date }[];
  terms: { slug: string; updatedAt: Date }[];
  systemPageLastModified: Map<string, Date>;
};

const D = (iso: string) => new Date(iso);

const emptyContent = (): ContentData => ({
  spaces: [],
  news: [],
  posts: [],
  postCategories: [],
  postTags: [],
  customPages: [],
  events: [],
  terms: [],
  systemPageLastModified: new Map(),
});

const allOnContext = (
  overrides: Partial<FeatureFilterContext> = {},
): FeatureFilterContext => ({
  enabled: new Set<FeatureModule>([
    "spaces",
    "reservation",
    "events",
    "posts",
    "news",
    "faq",
    "access",
    "contact",
    "reviews",
  ]),
  disabledRoutes: [],
  disabledPageSlugs: new Set<string>(),
  disabledSectionTypes: new Set<string>(),
  disabledTemplates: new Set<string>(),
  disabledCronPaths: new Set<string>(),
  ...overrides,
});

const SYSTEM_PAGE_LAST_MOD = new Map<string, Date>([
  ["home", D("2026-01-01T00:00:00Z")],
  ["about", D("2026-01-02T00:00:00Z")],
  ["access", D("2026-01-03T00:00:00Z")],
  ["contact", D("2026-01-04T00:00:00Z")],
  ["faq", D("2026-01-05T00:00:00Z")],
  ["reservation", D("2026-01-06T00:00:00Z")],
  ["terms", D("2026-01-07T00:00:00Z")],
]);

let contentFixture: ContentData = emptyContent();
let contextFixture: FeatureFilterContext = allOnContext();
let contentShouldThrow = false;

mock.module("@/shared/domain/sitemap/queries", () => ({
  getSitemapContentData: () =>
    contentShouldThrow
      ? Promise.reject(new Error("catastrophic db failure"))
      : Promise.resolve(contentFixture),
}));

mock.module("@/shared/lib/features/check", () => ({
  getFeatureFilterContext: () => Promise.resolve(contextFixture),
  isUrlDisabled: (url: string, disabledRoutes: readonly string[]): boolean =>
    disabledRoutes.some(
      (route) => url === route || url.startsWith(`${route}/`),
    ),
}));

const { default: sitemap, STATIC_PAGES } = await import("@/app/sitemap");

describe("app/sitemap.ts", () => {
  beforeEach(() => {
    contentFixture = emptyContent();
    contextFixture = allOnContext();
    contentShouldThrow = false;
  });

  describe("基本", () => {
    test("全 feature ON ＋ 全 STATIC_PAGES が DB に存在", async () => {
      contentFixture.systemPageLastModified = SYSTEM_PAGE_LAST_MOD;
      const result = await sitemap();
      expect(result).toHaveLength(STATIC_PAGES.length);
      expect(result.map((e) => e.url)).toEqual(
        STATIC_PAGES.map(({ path }) => `${BASE_URL}${path}`),
      );
    });

    test("全 URL が BASE_URL から始まり `//` を含まない", async () => {
      contentFixture = {
        ...emptyContent(),
        systemPageLastModified: SYSTEM_PAGE_LAST_MOD,
        spaces: [{ slug: "room-a", updatedAt: D("2026-06-20T00:00:00Z") }],
        posts: [
          {
            slug: "hello",
            updatedAt: D("2026-06-19T00:00:00Z"),
            publishedAt: D("2026-06-15T00:00:00Z"),
            category: { slug: "general" },
          },
        ],
        postCategories: [
          { slug: "general", updatedAt: D("2026-06-15T00:00:00Z") },
        ],
        postTags: [{ slug: "guide", updatedAt: D("2026-06-15T00:00:00Z") }],
      };
      const result = await sitemap();
      for (const entry of result) {
        // URL.origin で厳密 origin 比較 — `startsWith(BASE_URL)` は
        // `https://example.com.evil.com` を misfire させうる（CodeQL
        // js/incomplete-url-substring-sanitization）。new URL は path-only な
        // dangling `/` を保ったまま絶対 URL 検証できる。
        const parsed = new URL(entry.url);
        expect(parsed.origin).toBe(BASE_URL);
        expect(parsed.pathname.includes("//")).toBe(false);
      }
    });

    test("URL は uniqueness を満たす", async () => {
      contentFixture = {
        ...emptyContent(),
        systemPageLastModified: SYSTEM_PAGE_LAST_MOD,
        spaces: [
          { slug: "a", updatedAt: D("2026-06-01T00:00:00Z") },
          { slug: "b", updatedAt: D("2026-06-02T00:00:00Z") },
        ],
        posts: [
          {
            slug: "p1",
            updatedAt: D("2026-06-03T00:00:00Z"),
            publishedAt: D("2026-06-01T00:00:00Z"),
            category: { slug: "c1" },
          },
        ],
        postCategories: [{ slug: "c1", updatedAt: D("2026-06-01T00:00:00Z") }],
      };
      const result = await sitemap();
      const urls = result.map((e) => e.url);
      expect(new Set(urls).size).toBe(urls.length);
    });
  });

  describe("STATIC_PAGES gating（改善 1）", () => {
    test("systemPageLastModified に entry が無い slug は省略される", async () => {
      contentFixture.systemPageLastModified = new Map([
        ["home", D("2026-01-01T00:00:00Z")],
        ["about", D("2026-01-02T00:00:00Z")],
        // contact など 5 件は意図的に欠落
      ]);
      const result = await sitemap();
      const urls = result.map((e) => e.url);
      expect(urls).toContain(`${BASE_URL}/`);
      expect(urls).toContain(`${BASE_URL}/about`);
      expect(urls).not.toContain(`${BASE_URL}/contact`);
      expect(urls).not.toContain(`${BASE_URL}/faq`);
    });

    test("STATIC_PAGES の lastModified は systemPageLastModified Map の値が使われる", async () => {
      contentFixture.systemPageLastModified = SYSTEM_PAGE_LAST_MOD;
      const result = await sitemap();
      const home = result.find((e) => e.url === `${BASE_URL}/`);
      expect(home?.lastModified).toEqual(SYSTEM_PAGE_LAST_MOD.get("home"));
      const terms = result.find((e) => e.url === `${BASE_URL}/terms`);
      expect(terms?.lastModified).toEqual(SYSTEM_PAGE_LAST_MOD.get("terms"));
    });

    test("どの STATIC_PAGES emit にも `new Date()` 由来の lastModified が含まれない", async () => {
      contentFixture.systemPageLastModified = SYSTEM_PAGE_LAST_MOD;
      const before = Date.now();
      const result = await sitemap();
      const after = Date.now();
      for (const entry of result) {
        if (entry.lastModified === undefined) continue;
        const ts = (
          entry.lastModified instanceof Date
            ? entry.lastModified
            : new Date(entry.lastModified as string)
        ).getTime();
        // テスト実行ウィンドウ内のタイムスタンプは入っていないこと
        expect(ts < before || ts > after).toBe(true);
      }
    });
  });

  describe("listing 空 collection の省略（改善 2）", () => {
    test("spaces が空なら /spaces エントリは emit されない", async () => {
      contentFixture.systemPageLastModified = SYSTEM_PAGE_LAST_MOD;
      contentFixture.spaces = [];
      const result = await sitemap();
      expect(
        result.find((e) => e.url === `${BASE_URL}/spaces`),
      ).toBeUndefined();
    });

    test("posts が空なら /blog エントリは emit されない", async () => {
      contentFixture.systemPageLastModified = SYSTEM_PAGE_LAST_MOD;
      const result = await sitemap();
      expect(result.find((e) => e.url === `${BASE_URL}/blog`)).toBeUndefined();
    });

    test("spaces が 1 件以上あれば /spaces は最大 updatedAt で emit される", async () => {
      contentFixture.systemPageLastModified = SYSTEM_PAGE_LAST_MOD;
      contentFixture.spaces = [
        { slug: "a", updatedAt: D("2026-06-01T00:00:00Z") },
        { slug: "b", updatedAt: D("2026-06-20T00:00:00Z") },
        { slug: "c", updatedAt: D("2026-06-10T00:00:00Z") },
      ];
      const result = await sitemap();
      const listing = result.find((e) => e.url === `${BASE_URL}/spaces`);
      expect(listing?.lastModified).toEqual(D("2026-06-20T00:00:00Z"));
    });
  });

  describe("feature gate（改善 1 + 既存仕様）", () => {
    test("posts feature OFF で /blog ＋ /blog/*  ＋ /category/* ＋ /tag/* が同時消滅", async () => {
      contentFixture = {
        ...emptyContent(),
        systemPageLastModified: SYSTEM_PAGE_LAST_MOD,
        posts: [
          {
            slug: "p1",
            updatedAt: D("2026-06-01T00:00:00Z"),
            publishedAt: D("2026-06-01T00:00:00Z"),
            category: { slug: "c1" },
          },
        ],
        postCategories: [{ slug: "c1", updatedAt: D("2026-06-01T00:00:00Z") }],
        postTags: [{ slug: "t1", updatedAt: D("2026-06-01T00:00:00Z") }],
      };
      contextFixture = allOnContext({
        enabled: new Set<FeatureModule>([
          "spaces",
          "reservation",
          "events",
          "news",
          "faq",
          "access",
          "contact",
          "reviews",
        ]),
        disabledRoutes: ["/blog", "/category", "/tag"],
      });
      const result = await sitemap();
      const urls = result.map((e) => e.url);
      expect(urls).not.toContain(`${BASE_URL}/blog`);
      expect(urls.some((u) => u.startsWith(`${BASE_URL}/blog/`))).toBe(false);
      expect(urls.some((u) => u.startsWith(`${BASE_URL}/category/`))).toBe(
        false,
      );
      expect(urls.some((u) => u.startsWith(`${BASE_URL}/tag/`))).toBe(false);
    });

    test("contact feature OFF で /contact STATIC_PAGES エントリが消滅", async () => {
      contentFixture.systemPageLastModified = SYSTEM_PAGE_LAST_MOD;
      contextFixture = allOnContext({
        enabled: new Set<FeatureModule>([
          "spaces",
          "reservation",
          "events",
          "posts",
          "news",
          "faq",
          "access",
          "reviews",
        ]),
        disabledRoutes: ["/contact"],
      });
      const result = await sitemap();
      expect(
        result.find((e) => e.url === `${BASE_URL}/contact`),
      ).toBeUndefined();
    });
  });

  describe("customPages フィルタ（改善 6）", () => {
    test("disabledPageSlugs に hit する customPage は省略される", async () => {
      contentFixture = {
        ...emptyContent(),
        systemPageLastModified: SYSTEM_PAGE_LAST_MOD,
        customPages: [
          { slug: "company", updatedAt: D("2026-06-01T00:00:00Z") },
          { slug: "feature-x", updatedAt: D("2026-06-02T00:00:00Z") },
        ],
      };
      contextFixture = allOnContext({
        disabledPageSlugs: new Set(["feature-x"]),
      });
      const result = await sitemap();
      const urls = result.map((e) => e.url);
      expect(urls).toContain(`${BASE_URL}/company`);
      expect(urls).not.toContain(`${BASE_URL}/feature-x`);
    });

    test("isReservedPath に hit する customPage は省略される（過去データ防御）", async () => {
      contentFixture = {
        ...emptyContent(),
        systemPageLastModified: SYSTEM_PAGE_LAST_MOD,
        customPages: [
          { slug: "admin", updatedAt: D("2026-06-01T00:00:00Z") },
          { slug: "valid-page", updatedAt: D("2026-06-02T00:00:00Z") },
        ],
      };
      const result = await sitemap();
      const urls = result.map((e) => e.url);
      expect(urls).toContain(`${BASE_URL}/valid-page`);
      expect(urls).not.toContain(`${BASE_URL}/admin`);
    });
  });

  describe("encodeURIComponent 防御（改善 4）", () => {
    test("マルチバイト slug が URL encode されて emit される", async () => {
      contentFixture = {
        ...emptyContent(),
        systemPageLastModified: SYSTEM_PAGE_LAST_MOD,
        events: [{ slug: "夏祭り", updatedAt: D("2026-06-01T00:00:00Z") }],
      };
      const result = await sitemap();
      const entry = result.find((e) => e.url.startsWith(`${BASE_URL}/events/`));
      expect(entry?.url).toBe(
        `${BASE_URL}/events/${encodeURIComponent("夏祭り")}`,
      );
      // 生のマルチバイトが URL に出ていないこと
      expect(entry?.url).not.toContain("夏");
    });
  });

  describe("catastrophic 失敗時のフォールバック（改善 5）", () => {
    test("getSitemapContentData が throw すると STATIC_PAGES のみ返す", async () => {
      contentShouldThrow = true;
      const result = await sitemap();
      expect(result).toHaveLength(STATIC_PAGES.length);
      const urls = result.map((e) => e.url);
      for (const { path } of STATIC_PAGES) {
        expect(urls).toContain(`${BASE_URL}${path}`);
      }
    });
  });
});
