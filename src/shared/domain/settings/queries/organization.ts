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
import type { SocialPlatform } from "@/shared/lib/validations/enums/prisma-types";

export interface OrganizationSettings {
  siteName: string | null;
  siteDescription: string | null;
  businessName: string | null;
  businessNameKana: string | null;
  businessDescription: string | null;
  headerLogoUrl: string | null;
  phoneNumber: string | null;
  faxNumber: string | null;
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
    fetch: async () => {
      const [organization, seo] = await Promise.all([
        prisma.settingsOrganization.findUnique({
          where: { id: "singleton" },
          select: {
            businessName: true,
            businessNameKana: true,
            businessDescription: true,
            representativeName: true,
            establishedDate: true,
            registrationNumber: true,
            invoiceNumber: true,
            email: true,
            phoneNumber: true,
            faxNumber: true,
            postalCode: true,
            prefecture: true,
            city: true,
            streetAddress: true,
            buildingName: true,
            businessHours: true,
            holidayNotice: true,
          },
        }),
        prisma.settingsSeo.findUnique({
          where: { id: "singleton" },
          select: {
            siteName: true,
            siteDescription: true,
          },
        }),
      ]);

      if (!organization && !seo) {
        return null;
      }

      return {
        siteName: seo?.siteName ?? null,
        siteDescription: seo?.siteDescription ?? null,
        businessName: organization?.businessName ?? null,
        businessNameKana: organization?.businessNameKana ?? null,
        businessDescription: organization?.businessDescription ?? null,
        representativeName: organization?.representativeName ?? null,
        establishedDate: organization?.establishedDate ?? null,
        registrationNumber: organization?.registrationNumber ?? null,
        invoiceNumber: organization?.invoiceNumber ?? null,
        email: organization?.email ?? null,
        phoneNumber: organization?.phoneNumber ?? null,
        faxNumber: organization?.faxNumber ?? null,
        postalCode: organization?.postalCode ?? null,
        prefecture: organization?.prefecture ?? null,
        city: organization?.city ?? null,
        streetAddress: organization?.streetAddress ?? null,
        buildingName: organization?.buildingName ?? null,
        businessHours: organization?.businessHours ?? null,
        holidayNotice: organization?.holidayNotice ?? null,
      };
    },
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
      prisma.settingsSeo.findFirst({
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
    fetch: async () => {
      const [organization, seo] = await Promise.all([
        prisma.settingsOrganization.findUnique({
          where: { id: "singleton" },
          select: {
            businessName: true,
            businessNameKana: true,
            businessDescription: true,
            phoneNumber: true,
            faxNumber: true,
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
        prisma.settingsSeo.findUnique({
          where: { id: "singleton" },
          select: {
            siteName: true,
            siteDescription: true,
            headerLogoUrl: true,
          },
        }),
      ]);

      if (!organization && !seo) {
        return null;
      }

      return {
        siteName: seo?.siteName ?? null,
        siteDescription: seo?.siteDescription ?? null,
        businessName: organization?.businessName ?? null,
        businessNameKana: organization?.businessNameKana ?? null,
        businessDescription: organization?.businessDescription ?? null,
        headerLogoUrl: seo?.headerLogoUrl ?? null,
        phoneNumber: organization?.phoneNumber ?? null,
        faxNumber: organization?.faxNumber ?? null,
        email: organization?.email ?? null,
        postalCode: organization?.postalCode ?? null,
        prefecture: organization?.prefecture ?? null,
        city: organization?.city ?? null,
        streetAddress: organization?.streetAddress ?? null,
        buildingName: organization?.buildingName ?? null,
        businessHours: organization?.businessHours ?? null,
        establishedDate: organization?.establishedDate ?? null,
      };
    },
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getOrganizationSettings",
  });

  return toPlainObject(result);
}

export interface SocialLinkForFooter {
  platform: SocialPlatform;
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

  const organization = await safeFetch({
    fetch: () =>
      prisma.settingsOrganization.findUnique({
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
    organization?.businessName && organization.businessName.length > 0
      ? organization.businessName
      : "Myrrh Rental Space";
  const email =
    organization?.email && organization.email.length > 0
      ? organization.email
      : `noreply@${getAppHost()}`;

  return { name, email };
}
