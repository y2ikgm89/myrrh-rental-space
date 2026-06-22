import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import {
  HeaderBackgroundMode,
  HeaderScrollBehavior,
} from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import {
  isValidHeaderBackgroundMode,
  isValidHeaderScrollBehavior,
} from "@/shared/lib/validations/enums/guards";

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
  copyright: string | null;
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
          footerCopyright: true,
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
    copyright: result?.footerCopyright ?? null,
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

// getFaviconUrl was removed (PR-B clean-break). favicon は Next.js
// file-convention `src/app/favicon.ico` を SSoT とする運用に移行済。
