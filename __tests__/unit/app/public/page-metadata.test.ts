/**
 * `generatePageMetadata` — 非公開システムページの noindex 分岐
 *
 * 固定ルート page.tsx の `generateMetadata` は全て `generatePageMetadata(slug)` を
 * 呼ぶ統一パイプライン。ページが「存在するが非公開」の場合、従来は
 * `getPageSeo`（PUBLIC_WHERE gate で null）→ `defaultSeo`（SystemPageDefinition）に
 * フォールバックし、robots メタデータを一切出さず indexable なままだった。
 * 本テストは非公開時に `[...segments]/page.tsx` の 404 metadata と同型の
 * `{ title: "ページが見つかりません", robots: { index: false, follow: false } }` を
 * 返すことを固定する。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { SITE_DEFAULTS } from "@/shared/lib/constants";

mock.module("server-only", () => ({}));

const mockGetPageSeo = mock<(_slug: string) => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const mockIsPublicPageUnpublished = mock<(_slug: string) => Promise<boolean>>(
  () => Promise.resolve(false),
);

mock.module("@/shared/domain/pages/queries", () => ({
  getPageSeo: (slug: string) => mockGetPageSeo(slug),
  isPublicPageUnpublished: (slug: string) => mockIsPublicPageUnpublished(slug),
}));

const mockGetSeoSettings = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);

mock.module("@/shared/domain/settings/queries/site", () => ({
  getSeoSettings: () => mockGetSeoSettings(),
}));

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: (module: string) => mockIsFeatureEnabled(module),
}));

const { generatePageMetadata } = await import("@/public/lib/page-metadata");

describe("generatePageMetadata — 非公開判定", () => {
  beforeEach(() => {
    mockGetPageSeo.mockReset();
    mockGetPageSeo.mockResolvedValue(null);
    mockIsPublicPageUnpublished.mockReset();
    mockIsPublicPageUnpublished.mockResolvedValue(false);
    mockGetSeoSettings.mockReset();
    mockGetSeoSettings.mockResolvedValue(null);
  });

  test("非公開ページ → noindex metadata を返し getPageSeo/getSeoSettings は呼ばない", async () => {
    mockIsPublicPageUnpublished.mockResolvedValue(true);

    const metadata = await generatePageMetadata("about");

    expect(metadata).toEqual({
      title: "ページが見つかりません",
      robots: { index: false, follow: false },
    });
    expect(mockGetPageSeo).not.toHaveBeenCalled();
    expect(mockGetSeoSettings).not.toHaveBeenCalled();
  });

  test("公開ページ（DB未カスタマイズ含む）→ 通常の SEO metadata を返す（robots は出さない）", async () => {
    mockIsPublicPageUnpublished.mockResolvedValue(false);
    mockGetPageSeo.mockResolvedValue(null);

    const metadata = await generatePageMetadata("about");

    expect(metadata.title).toBe("会社概要");
    expect(metadata.robots).toBeUndefined();
  });
});

describe("generatePageMetadata — description fallback", () => {
  beforeEach(() => {
    mockGetPageSeo.mockReset();
    mockGetPageSeo.mockResolvedValue(null);
    mockIsPublicPageUnpublished.mockReset();
    mockIsPublicPageUnpublished.mockResolvedValue(false);
    mockGetSeoSettings.mockReset();
    mockGetSeoSettings.mockResolvedValue(null);
  });

  test("defaultMetaDescription 空 → siteDescription を使う", async () => {
    mockGetSeoSettings.mockResolvedValue({
      siteName: "Custom Site",
      siteDescription: "Settings site description",
      defaultMetaDescription: "",
      defaultOgpImageUrl: null,
      defaultMetaKeywords: null,
      defaultOgpTitle: null,
      defaultOgpDescription: null,
    });

    const metadata = await generatePageMetadata("about");

    expect(metadata.description).toBe("Settings site description");
    expect(metadata.openGraph?.siteName).toBe("Custom Site");
  });

  test("settings 空 → システムページ default metaDescription", async () => {
    const metadata = await generatePageMetadata("about");

    expect(metadata.description).toBe("会社・サービスについて");
  });

  test("page SEO metaDescription が最優先", async () => {
    mockGetPageSeo.mockResolvedValue({
      title: "Custom title",
      metaDescription: "Page meta",
      metaKeywords: null,
      ogpTitle: null,
      ogpDescription: null,
      ogpImageUrl: null,
    });
    mockGetSeoSettings.mockResolvedValue({
      siteName: "Custom Site",
      siteDescription: "Settings site description",
      defaultMetaDescription: "Settings meta",
      defaultOgpImageUrl: null,
      defaultMetaKeywords: null,
      defaultOgpTitle: null,
      defaultOgpDescription: null,
    });

    const metadata = await generatePageMetadata("about");

    expect(metadata.description).toBe("Page meta");
  });

  test("システム default も無い slug → SITE_DEFAULTS.description", async () => {
    const metadata = await generatePageMetadata("nonexistent-slug");

    expect(metadata.description).toBe(SITE_DEFAULTS.description);
  });
});

describe("generatePageMetadata — home title", () => {
  beforeEach(() => {
    mockGetPageSeo.mockReset();
    mockGetPageSeo.mockResolvedValue(null);
    mockIsPublicPageUnpublished.mockReset();
    mockIsPublicPageUnpublished.mockResolvedValue(false);
    mockGetSeoSettings.mockReset();
    mockGetSeoSettings.mockResolvedValue({
      siteName: "Custom Site",
      siteDescription: "Settings site description",
      defaultMetaDescription: null,
      defaultOgpImageUrl: null,
      defaultMetaKeywords: null,
      defaultOgpTitle: null,
      defaultOgpDescription: null,
    });
  });

  test("DB title 欠落 → absolute siteName（弱い「ホームページ | site」を避ける）", async () => {
    mockGetPageSeo.mockResolvedValue(null);

    const metadata = await generatePageMetadata("home");

    expect(metadata.title).toEqual({ absolute: "Custom Site" });
  });

  test("DB title がシステム既定「ホームページ」→ absolute siteName", async () => {
    mockGetPageSeo.mockResolvedValue({
      title: "ホームページ",
      metaDescription: null,
      metaKeywords: null,
      ogpTitle: null,
      ogpDescription: null,
      ogpImageUrl: null,
    });

    const metadata = await generatePageMetadata("home");

    expect(metadata.title).toEqual({ absolute: "Custom Site" });
  });

  test("カスタム DB title → absolute でそのまま使う", async () => {
    mockGetPageSeo.mockResolvedValue({
      title: "レンタルスペース Myrrh",
      metaDescription: null,
      metaKeywords: null,
      ogpTitle: null,
      ogpDescription: null,
      ogpImageUrl: null,
    });

    const metadata = await generatePageMetadata("home");

    expect(metadata.title).toEqual({ absolute: "レンタルスペース Myrrh" });
  });
});

describe("generatePageMetadata — feature gate", () => {
  beforeEach(() => {
    mockGetPageSeo.mockReset();
    mockIsPublicPageUnpublished.mockReset();
    mockIsPublicPageUnpublished.mockResolvedValue(false);
    mockGetSeoSettings.mockReset();
    mockGetSeoSettings.mockResolvedValue(null);
    mockIsFeatureEnabled.mockReset();
    mockIsFeatureEnabled.mockResolvedValue(true);
  });

  test("posts OFF + slug=blog → noindex（DB SEO を出さない）", async () => {
    mockIsFeatureEnabled.mockImplementation(
      async (module) => module !== "posts",
    );

    const metadata = await generatePageMetadata("blog");

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(mockGetPageSeo).not.toHaveBeenCalled();
  });
});
