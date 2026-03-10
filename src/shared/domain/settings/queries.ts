import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import type { AnalyticsType } from "@/shared/db/enums";
import {
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  LayoutWidth,
  PostPermalinkStructure,
} from "@/shared/db/enums";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import {
  isValidHeaderBackgroundMode,
  isValidHeaderScrollBehavior,
} from "@/shared/lib/validations/enums";
import {
  idParamSchema,
  slugParamSchema,
} from "@/shared/lib/validations/params";
import type { LayoutConfig } from "@/shared/types/layout";

export interface HeaderSettings {
  scrollBehavior: HeaderScrollBehavior;
  backgroundMode: HeaderBackgroundMode;
}

export interface SeoSettings {
  siteName: string | null;
  siteDescription: string | null;
  defaultOgpImageUrl: string | null;
  defaultMetaDescription: string | null;
  defaultMetaKeywords: string | null;
  defaultOgpTitle: string | null;
  defaultOgpDescription: string | null;
}

export interface OrganizationSettings {
  siteName: string | null;
  siteDescription: string | null;
  businessName: string | null;
  businessDescription: string | null;
  headerLogoUrl: string | null;
  phoneNumber: string | null;
  email: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  businessHours: unknown;
  specialHolidays: unknown;
  latitude: number | null;
  longitude: number | null;
  priceRange: string | null;
  businessAttributes: unknown;
  paymentAccepted: string | null;
  establishedDate: Date | null;
}

export type AnalyticsConfig = {
  analyticsType: AnalyticsType | null;
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  googleSearchConsoleId: string | null;
  bingWebmasterToolsId: string | null;
  gaPropertyId: string | null;
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
  };
}

export async function getCookieConsentSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.COOKIE_CONSENT, CACHE_TAGS.SETTINGS);

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

export async function getNotificationEmailAddresses(): Promise<string[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          notificationEmailAddresses: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getNotificationEmailAddresses",
  });

  if (!settings?.notificationEmailAddresses) {
    return [];
  }

  return settings.notificationEmailAddresses
    .split(",")
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}

export async function getCalendarEmailSettings(): Promise<{
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
}> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          icalAttachmentEnabled: true,
          addToCalendarLinksEnabled: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getCalendarEmailSettings",
  });

  return {
    icalAttachmentEnabled: settings?.icalAttachmentEnabled ?? true,
    addToCalendarLinksEnabled: settings?.addToCalendarLinksEnabled ?? true,
  };
}

export async function getPublicBusinessSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          siteName: true,
          siteDescription: true,
          businessName: true,
          businessNameKana: true,
          businessDescription: true,
          businessType: true,
          representativeName: true,
          establishedDate: true,
          registrationNumber: true,
          invoiceNumber: true,
          email: true,
          phoneNumber: true,
          address: true,
          postalCode: true,
          prefecture: true,
          city: true,
          streetAddress: true,
          buildingName: true,
          businessHours: true,
          holidayNotice: true,
          googleReviewUrl: true,
          googleBusinessPlaceId: true,
          businessAttributes: true,
          paymentAccepted: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicBusinessSettings",
  });

  return toPlainObject(result);
}

export async function getHeaderSettings(): Promise<HeaderSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          headerScrollBehavior: true,
          headerBackgroundMode: true,
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
  };
}

export async function getAdminBrandingSettings(): Promise<{
  siteName: string | null;
  headerLogoUrl: string | null;
  useHeaderLogo: boolean;
}> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findFirst({
        select: {
          siteName: true,
          headerLogoUrl: true,
          useHeaderLogo: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getAdminBrandingSettings",
  });

  return {
    siteName: settings?.siteName ?? null,
    headerLogoUrl: settings?.headerLogoUrl ?? null,
    useHeaderLogo: settings?.useHeaderLogo ?? true,
  };
}

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ANALYTICS_CONFIG, CACHE_TAGS.SETTINGS);

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
  };
}

export async function getSeoSettings(): Promise<SeoSettings | null> {
  "use cache";
  cacheLife(CACHE_LIFE.METADATA);
  cacheTag(CACHE_TAGS.SEO_SETTINGS, CACHE_TAGS.SETTINGS);

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

export async function getOrganizationSettings(): Promise<OrganizationSettings | null> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ORGANIZATION_SETTINGS, CACHE_TAGS.SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          siteName: true,
          siteDescription: true,
          businessName: true,
          businessDescription: true,
          headerLogoUrl: true,
          phoneNumber: true,
          email: true,
          postalCode: true,
          prefecture: true,
          city: true,
          streetAddress: true,
          buildingName: true,
          businessHours: true,
          specialHolidays: true,
          latitude: true,
          longitude: true,
          priceRange: true,
          businessAttributes: true,
          paymentAccepted: true,
          establishedDate: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getOrganizationSettings",
  });

  return toPlainObject(result);
}

export async function getSocialLinkUrls(): Promise<string[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SOCIAL_LINKS, CACHE_TAGS.SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.socialLink.findMany({
        where: { isActive: true },
        select: { url: true },
        orderBy: { order: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSocialLinkUrls",
  });

  return result.map((link) => link.url);
}

export async function getPermalinkSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.PERMALINK, CACHE_TAGS.SETTINGS);

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

export async function getPublicRobotsTxtSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ROBOTS_TXT, CACHE_TAGS.SETTINGS);

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

export async function getMaintenanceSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.SETTINGS);

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

export async function getSiteLayoutSettings(): Promise<LayoutConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS);

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

export async function getPostLayoutSettings(
  postId: string,
): Promise<LayoutConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(
    CACHE_TAGS.SETTINGS,
    getCacheTag.layoutSettings.site(),
    getCacheTag.layoutSettings.post(postId),
  );

  if (!idParamSchema.safeParse(postId).success) {
    return FALLBACK_LAYOUT_CONFIG;
  }

  const [siteSettings, postSettings] = await Promise.all([
    getSiteLayoutSettings(),
    prisma.post.findUnique({
      where: { id: postId },
      select: {
        contentWidth: true,
        contentWidthCustom: true,
      },
    }),
  ]);

  return {
    containerWidth: siteSettings.containerWidth,
    containerWidthCustom: siteSettings.containerWidthCustom,
    contentWidth: postSettings?.contentWidth ?? siteSettings.contentWidth,
    contentWidthCustom:
      postSettings?.contentWidthCustom ?? siteSettings.contentWidthCustom,
  };
}

export async function getNewsLayoutSettings(
  newsId: string,
): Promise<LayoutConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(
    CACHE_TAGS.SETTINGS,
    getCacheTag.layoutSettings.site(),
    getCacheTag.layoutSettings.news(newsId),
  );

  if (!idParamSchema.safeParse(newsId).success) {
    return FALLBACK_LAYOUT_CONFIG;
  }

  const [siteSettings, newsSettings] = await Promise.all([
    getSiteLayoutSettings(),
    prisma.news.findUnique({
      where: { id: newsId },
      select: {
        contentWidth: true,
        contentWidthCustom: true,
      },
    }),
  ]);

  return {
    containerWidth: siteSettings.containerWidth,
    containerWidthCustom: siteSettings.containerWidthCustom,
    contentWidth: newsSettings?.contentWidth ?? siteSettings.contentWidth,
    contentWidthCustom:
      newsSettings?.contentWidthCustom ?? siteSettings.contentWidthCustom,
  };
}

export async function getPageLayoutSettings(
  slug: string,
): Promise<LayoutConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(
    CACHE_TAGS.SETTINGS,
    getCacheTag.layoutSettings.site(),
    getCacheTag.layoutSettings.page(slug),
  );

  if (!slugParamSchema.safeParse(slug).success) {
    return FALLBACK_LAYOUT_CONFIG;
  }

  const [siteSettings, pageSettings] = await Promise.all([
    getSiteLayoutSettings(),
    prisma.page.findUnique({
      where: { slug },
      select: {
        contentWidth: true,
        contentWidthCustom: true,
      },
    }),
  ]);

  return {
    containerWidth: siteSettings.containerWidth,
    containerWidthCustom: siteSettings.containerWidthCustom,
    contentWidth: pageSettings?.contentWidth ?? siteSettings.contentWidth,
    contentWidthCustom:
      pageSettings?.contentWidthCustom ?? siteSettings.contentWidthCustom,
  };
}

export async function getLayoutSettings(): Promise<LayoutConfig> {
  return getSiteLayoutSettings();
}
