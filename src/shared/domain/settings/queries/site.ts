import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import type { AnalyticsType } from "@generated/prisma/enums";
import { LayoutWidth } from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import type { LayoutConfig } from "@/shared/types/layout";

export interface SeoSettings {
  siteName: string | null;
  siteDescription: string | null;
  defaultOgpImageUrl: string | null;
  defaultMetaDescription: string | null;
  defaultMetaKeywords: string | null;
  defaultOgpTitle: string | null;
  defaultOgpDescription: string | null;
}

export type AnalyticsConfig = {
  analyticsType: AnalyticsType | null;
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  googleSearchConsoleId: string | null;
  bingWebmasterToolsId: string | null;
  gaPropertyId: string | null;
  microsoftClarityId: string | null;
};

const FALLBACK_LAYOUT_CONFIG: LayoutConfig = {
  containerWidth: LayoutWidth.LG,
  containerWidthCustom: null,
  contentWidth: LayoutWidth.MD,
  contentWidthCustom: null,
};

function getDefaultAnalyticsConfig(): AnalyticsConfig {
  return {
    analyticsType: null,
    googleAnalyticsId: null,
    googleTagManagerId: null,
    googleSearchConsoleId: null,
    bingWebmasterToolsId: null,
    gaPropertyId: null,
    microsoftClarityId: null,
  };
}

export async function getCookieConsentSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.COOKIE_CONSENT);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          cookieConsentEnabled: true,
          cookieConsentMessage: true,
          cookieConsentAcceptText: true,
          cookieConsentRejectText: true,
          cookieConsentPolicyUrl: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getCookieConsentSettings",
  });

  return toPlainObject(result);
}

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ANALYTICS_CONFIG);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          analyticsType: true,
          googleAnalyticsId: true,
          googleTagManagerId: true,
          googleSearchConsoleId: true,
          bingWebmasterToolsId: true,
          gaPropertyId: true,
          microsoftClarityId: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAnalyticsConfig",
  });

  if (!settings) {
    return getDefaultAnalyticsConfig();
  }

  return {
    analyticsType: settings.analyticsType,
    googleAnalyticsId: settings.googleAnalyticsId ?? null,
    googleTagManagerId: settings.googleTagManagerId ?? null,
    googleSearchConsoleId: settings.googleSearchConsoleId ?? null,
    bingWebmasterToolsId: settings.bingWebmasterToolsId ?? null,
    gaPropertyId: settings.gaPropertyId ?? null,
    microsoftClarityId: settings.microsoftClarityId ?? null,
  };
}

export async function getSeoSettings(): Promise<SeoSettings | null> {
  "use cache";
  cacheLife(CACHE_LIFE.METADATA);
  cacheTag(CACHE_TAGS.SEO_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          siteName: true,
          siteDescription: true,
          defaultOgpImageUrl: true,
          defaultMetaDescription: true,
          defaultMetaKeywords: true,
          defaultOgpTitle: true,
          defaultOgpDescription: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSeoSettings",
  });

  return toPlainObject(result);
}

export async function getMaintenanceSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.LAYOUT_SETTINGS);

  const result = await safeFetch({
    fetch: async () => {
      const settings = await prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          maintenanceMode: true,
          maintenanceMessage: true,
        },
      });
      return settings ?? { maintenanceMode: false, maintenanceMessage: null };
    },
    fallback: { maintenanceMode: false, maintenanceMessage: null },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    operationName: "getMaintenanceSettings",
  });

  return toPlainObject(result);
}

export async function getPublicRobotsTxtSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ROBOTS_TXT);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          robotsTxtEnabled: true,
          robotsTxtCustom: true,
        },
      }),
    fallback: { robotsTxtEnabled: false, robotsTxtCustom: null },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicRobotsTxtSettings",
  });

  return toPlainObject(result);
}

export async function getSiteLayoutSettings(): Promise<LayoutConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LAYOUT_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          containerWidth: true,
          containerWidthCustom: true,
          contentWidth: true,
          contentWidthCustom: true,
        },
      }),
    fallback: FALLBACK_LAYOUT_CONFIG,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSiteLayoutSettings",
  });

  if (!result) {
    return FALLBACK_LAYOUT_CONFIG;
  }

  return {
    containerWidth:
      result.containerWidth ?? FALLBACK_LAYOUT_CONFIG.containerWidth,
    containerWidthCustom: result.containerWidthCustom,
    contentWidth: result.contentWidth ?? FALLBACK_LAYOUT_CONFIG.contentWidth,
    contentWidthCustom: result.contentWidthCustom,
  };
}

/**
 * サイト全体のレイアウト設定に、記事 / お知らせ個別の contentWidth 上書きをマージする純関数。
 *
 * 個別の contentWidth / contentWidthCustom は記事 / お知らせ本体クエリ
 * （getPublishedPost / getPublishedNewsItem）が既に select・キャッシュ無効化している。
 * かつて存在した getPostLayoutSettings / getNewsLayoutSettings は同じ列を別クエリで再取得し
 * 独自タグ（layoutSettings.post/news）でキャッシュしていたが、編集後の mutation がそのタグを
 * 無効化しておらず read-your-writes ラグを起こしていた。重複した cached source を廃し、
 * 個別レイアウトの無効化を記事本体のキャッシュタグへ一本化する（SSoT）。
 */
export function mergeContentLayout(
  siteSettings: LayoutConfig,
  override: {
    contentWidth: LayoutWidth | null;
    contentWidthCustom: number | null;
  },
): LayoutConfig {
  return {
    containerWidth: siteSettings.containerWidth,
    containerWidthCustom: siteSettings.containerWidthCustom,
    contentWidth: override.contentWidth ?? siteSettings.contentWidth,
    contentWidthCustom:
      override.contentWidthCustom ?? siteSettings.contentWidthCustom,
  };
}

export async function getLayoutSettings(): Promise<LayoutConfig> {
  return getSiteLayoutSettings();
}
