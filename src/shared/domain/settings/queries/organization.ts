import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
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
  specialHolidays: unknown;
  latitude: number | null;
  longitude: number | null;
  priceRange: string | null;
  businessAttributes: unknown;
  paymentAccepted: string | null;
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
          address: true,
          postalCode: true,
          prefecture: true,
          city: true,
          streetAddress: true,
          buildingName: true,
          businessHours: true,
          holidayNotice: true,
          accessInfo: true,
          parkingInfo: true,
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
