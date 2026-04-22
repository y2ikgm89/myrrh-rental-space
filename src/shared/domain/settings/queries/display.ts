import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import {
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  PostPermalinkStructure,
} from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import {
  isValidHeaderBackgroundMode,
  isValidHeaderScrollBehavior,
} from "@/shared/lib/validations/enums/guards";
import type { PublicSectionStyle } from "@/shared/domain/sections/queries";

/**
 * ブランド表示用の共有型。
 * ヘッダー/フッター両方で使用（`siteName` フォールバック + logo トグル + URL）。
 */
export interface SiteBrand {
  siteName: string;
  logoUrl: string | null;
  useLogo: boolean;
}

export interface HeaderSettings {
  scrollBehavior: HeaderScrollBehavior;
  backgroundMode: HeaderBackgroundMode;
  brand: SiteBrand;
}

export interface FooterSettings {
  tagline: string | null;
  navigationLabel: string;
  contactLabel: string;
  hoursLabel: string;
  showSocialLinks: boolean;
  themeColor: string;
  brand: SiteBrand;
}

const DEFAULT_SITE_NAME = "Myrrh Rental Space";

export async function getHeaderSettings(): Promise<HeaderSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.LAYOUT_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          headerScrollBehavior: true,
          headerBackgroundMode: true,
          siteName: true,
          headerLogoUrl: true,
          useHeaderLogo: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getHeaderSettings",
  });

  return {
    scrollBehavior: isValidHeaderScrollBehavior(result?.headerScrollBehavior)
      ? result.headerScrollBehavior
      : HeaderScrollBehavior.always_visible,
    backgroundMode: isValidHeaderBackgroundMode(result?.headerBackgroundMode)
      ? result.headerBackgroundMode
      : HeaderBackgroundMode.solid,
    brand: {
      siteName: result?.siteName ?? DEFAULT_SITE_NAME,
      logoUrl: result?.headerLogoUrl ?? null,
      useLogo: result?.useHeaderLogo ?? true,
    },
  };
}

export async function getFooterSettings(): Promise<FooterSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.LAYOUT_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          footerTagline: true,
          footerNavigationLabel: true,
          footerContactLabel: true,
          footerHoursLabel: true,
          footerShowSocialLinks: true,
          themeColor: true,
          siteName: true,
          footerLogoUrl: true,
          useFooterLogo: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getFooterSettings",
  });

  return {
    tagline: result?.footerTagline ?? null,
    navigationLabel: result?.footerNavigationLabel ?? "Navigation",
    contactLabel: result?.footerContactLabel ?? "Contact",
    hoursLabel: result?.footerHoursLabel ?? "Hours",
    showSocialLinks: result?.footerShowSocialLinks ?? true,
    themeColor: result?.themeColor ?? "#fafafa",
    brand: {
      siteName: result?.siteName ?? DEFAULT_SITE_NAME,
      logoUrl: result?.footerLogoUrl ?? null,
      useLogo: result?.useFooterLogo ?? true,
    },
  };
}

export async function getPermalinkSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.PERMALINK);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          postUrlPrefixEnabled: true,
          postPermalinkStructure: true,
        },
      }),
    fallback: {
      postUrlPrefixEnabled: true,
      postPermalinkStructure: PostPermalinkStructure.post_name,
    },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPermalinkSettings",
  });

  return toPlainObject(result);
}

export async function getPostUrlPrefix(): Promise<string> {
  const settings = await getPermalinkSettings();
  return (settings?.postUrlPrefixEnabled ?? true) ? "/posts" : "";
}

/**
 * Phase B.C5: Settings.globalSectionStyle — SectionRenderer の 4-tier cascade
 * 最下位レイヤー（Settings → Page → Section → Override の順で specificity 上昇）。
 *
 * 公開バンドルを最小化するため globalSectionStyle 関連フィールドだけを取得する。
 * 未設定（singleton 不在 / relation null）時は { globalSectionStyle: null } を返し、
 * resolver が DEFAULT_SECTION_STYLE fallback に委ねる。
 */
export type PublicSettingsForStyleData = {
  readonly globalSectionStyle: PublicSectionStyle | null;
};

export async function getPublicSettingsForStyle(): Promise<PublicSettingsForStyleData> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.LAYOUT_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          globalSectionStyle: {
            select: {
              spacing: true,
              background: true,
              container: true,
              typography: true,
              animation: true,
              customClass: true,
            },
          },
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicSettingsForStyle",
  });

  const plain = toPlainObject(result);
  return { globalSectionStyle: plain?.globalSectionStyle ?? null };
}
