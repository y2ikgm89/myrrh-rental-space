/**
 * resolveSiteBranding — SettingsSeo → サイト共通ブランディング解決
 */

import { describe, expect, test } from "bun:test";
import { SITE_DEFAULTS } from "@/shared/lib/constants";
import {
  resolvePageDescription,
  resolveSiteBranding,
} from "@/public/lib/seo/metadata-factory";

describe("resolveSiteBranding", () => {
  test("null settings → SITE_DEFAULTS にフォールバック", () => {
    expect(resolveSiteBranding(null)).toEqual({
      siteName: SITE_DEFAULTS.name,
      description: SITE_DEFAULTS.description,
      ogTitle: SITE_DEFAULTS.name,
      ogDescription: SITE_DEFAULTS.description,
    });
  });

  test("空文字は無視して SITE_DEFAULTS / 次候補へ", () => {
    expect(
      resolveSiteBranding({
        siteName: "  ",
        siteDescription: "",
        defaultMetaDescription: "DB meta",
        defaultOgpImageUrl: null,
        defaultMetaKeywords: null,
        defaultOgpTitle: "",
        defaultOgpDescription: "  OG desc  ",
      }),
    ).toEqual({
      siteName: SITE_DEFAULTS.name,
      description: "DB meta",
      ogTitle: SITE_DEFAULTS.name,
      ogDescription: "OG desc",
    });
  });

  test("DB 値を優先して OGP defaults をマージ", () => {
    expect(
      resolveSiteBranding({
        siteName: "Custom Site",
        siteDescription: "Site desc",
        defaultMetaDescription: "Meta desc",
        defaultOgpImageUrl: null,
        defaultMetaKeywords: null,
        defaultOgpTitle: "OG Title",
        defaultOgpDescription: "OG Description",
      }),
    ).toEqual({
      siteName: "Custom Site",
      description: "Meta desc",
      ogTitle: "OG Title",
      ogDescription: "OG Description",
    });
  });
});

describe("resolvePageDescription", () => {
  test("page SEO > defaultMetaDescription > siteDescription > system default > SITE_DEFAULTS", () => {
    expect(
      resolvePageDescription(
        {
          siteName: null,
          siteDescription: "Site desc",
          defaultMetaDescription: "Meta desc",
          defaultOgpImageUrl: null,
          defaultMetaKeywords: null,
          defaultOgpTitle: null,
          defaultOgpDescription: null,
        },
        "Page desc",
        "System desc",
      ),
    ).toBe("Page desc");

    expect(
      resolvePageDescription(
        {
          siteName: null,
          siteDescription: "Site desc",
          defaultMetaDescription: "Meta desc",
          defaultOgpImageUrl: null,
          defaultMetaKeywords: null,
          defaultOgpTitle: null,
          defaultOgpDescription: null,
        },
        null,
        "System desc",
      ),
    ).toBe("Meta desc");

    expect(
      resolvePageDescription(
        {
          siteName: null,
          siteDescription: "Site desc",
          defaultMetaDescription: "",
          defaultOgpImageUrl: null,
          defaultMetaKeywords: null,
          defaultOgpTitle: null,
          defaultOgpDescription: null,
        },
        null,
        "System desc",
      ),
    ).toBe("Site desc");

    expect(
      resolvePageDescription(
        {
          siteName: null,
          siteDescription: "",
          defaultMetaDescription: "",
          defaultOgpImageUrl: null,
          defaultMetaKeywords: null,
          defaultOgpTitle: null,
          defaultOgpDescription: null,
        },
        null,
        "System desc",
      ),
    ).toBe("System desc");

    expect(resolvePageDescription(null, null, null)).toBe(
      SITE_DEFAULTS.description,
    );
  });
});
