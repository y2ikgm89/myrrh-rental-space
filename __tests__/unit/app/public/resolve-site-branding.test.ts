/**
 * resolveSiteBranding — SettingsSeo → サイト共通ブランディング解決
 */

import { describe, expect, test } from "bun:test";
import { SITE_DEFAULTS } from "@/shared/lib/constants";
import { resolveSiteBranding } from "@/public/lib/seo/metadata-factory";

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
