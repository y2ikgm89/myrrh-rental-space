/**
 * generateArticleMetadata — OGP title/description fallback
 *
 * `generatePageMetadata` と同じ解決順を記事系ページでも保証する。
 */

import { describe, expect, test } from "bun:test";
import { SITE_DEFAULTS } from "@/shared/lib/constants";
import { generateArticleMetadata } from "@/public/lib/seo/metadata-factory";

const baseSettings = {
  siteName: "My Site Name",
  siteDescription: "Site-wide description",
  defaultMetaDescription: "Default meta description",
  defaultOgpImageUrl: null,
  defaultMetaKeywords: null,
  defaultOgpTitle: null,
  defaultOgpDescription: null,
} as const;

describe("generateArticleMetadata — og:title fallback", () => {
  test("ogpTitle 空 + defaultOgpTitle null → og:title === article.title（siteName ではない）", () => {
    const metadata = generateArticleMetadata(
      {
        title: "Article Title",
        description: "Article description",
        ogpTitle: null,
      },
      baseSettings,
    );

    expect(metadata.openGraph?.title).toBe("Article Title");
    expect(metadata.openGraph?.title).not.toBe(baseSettings.siteName);
    expect(metadata.twitter?.title).toBe("Article Title");
  });

  test("ogpTitle 空 + defaultOgpTitle 設定 → og:title === defaultOgpTitle", () => {
    const metadata = generateArticleMetadata(
      {
        title: "Article Title",
        description: "Article description",
        ogpTitle: "",
      },
      {
        ...baseSettings,
        defaultOgpTitle: "Default OGP Title",
      },
    );

    expect(metadata.openGraph?.title).toBe("Default OGP Title");
    expect(metadata.twitter?.title).toBe("Default OGP Title");
  });
});

describe("generateArticleMetadata — og:description fallback", () => {
  test("ogpDescription 空 + defaultOgpDescription null → og:description === article.description", () => {
    const metadata = generateArticleMetadata(
      {
        title: "Article Title",
        description: "Article description",
        ogpDescription: null,
      },
      baseSettings,
    );

    expect(metadata.openGraph?.description).toBe("Article description");
    expect(metadata.twitter?.description).toBe("Article description");
  });

  test("ogpDescription 空 + defaults null + article.description null → site description fallback", () => {
    const metadata = generateArticleMetadata(
      {
        title: "Article Title",
        description: null,
        ogpDescription: null,
      },
      null,
    );

    expect(metadata.description).toBe(SITE_DEFAULTS.description);
    expect(metadata.openGraph?.description).toBe(SITE_DEFAULTS.description);
    expect(metadata.twitter?.description).toBe(SITE_DEFAULTS.description);
  });
});
