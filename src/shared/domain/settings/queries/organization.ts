import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getAppHost } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";

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
  establishedDate: Date | null;
}

export async function getPublicBusinessSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

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
          postalCode: true,
          prefecture: true,
          city: true,
          streetAddress: true,
          buildingName: true,
          businessHours: true,
          holidayNotice: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicBusinessSettings",
  });

  return toPlainObject(result);
}

export async function getAdminBrandingSettings(): Promise<{
  siteName: string | null;
  headerLogoUrl: string | null;
  useHeaderLogo: boolean;
}> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ORGANIZATION_SETTINGS);

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

export async function getOrganizationSettings(): Promise<Serialized<OrganizationSettings> | null> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ORGANIZATION_SETTINGS);

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

export interface SocialLinkForFooter {
  platform: string;
  url: string;
  showOnDesktop: boolean;
  showOnMobile: boolean;
}

export async function getSocialLinkUrls(): Promise<string[]> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SOCIAL_LINKS);

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

export async function getSocialLinksForFooter(): Promise<
  SocialLinkForFooter[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SOCIAL_LINKS);

  const result = await safeFetch({
    fetch: () =>
      prisma.socialLink.findMany({
        where: { isActive: true },
        select: {
          platform: true,
          url: true,
          showOnDesktop: true,
          showOnMobile: true,
        },
        orderBy: { order: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSocialLinksForFooter",
  });

  return result.map((link) => ({
    platform: link.platform,
    url: link.url,
    showOnDesktop: link.showOnDesktop,
    showOnMobile: link.showOnMobile,
  }));
}

/**
 * iCal ICS の ORGANIZER フィールド用設定を返す。
 *
 * RFC 5545 ORGANIZER は必須ではないが、設定するとカレンダーアプリ上で
 * 組織名として表示される。`Settings.businessName` / `Settings.email` を正とし、
 * 未設定時は `"Myrrh Rental Space"` / `noreply@<host>` にフォールバック。
 */
export async function getIcalOrganizer(): Promise<{
  name: string;
  email: string;
}> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

  const settings = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          businessName: true,
          email: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getIcalOrganizer",
  });

  const name =
    settings?.businessName && settings.businessName.length > 0
      ? settings.businessName
      : "Myrrh Rental Space";
  const email =
    settings?.email && settings.email.length > 0
      ? settings.email
      : `noreply@${getAppHost()}`;

  return { name, email };
}
