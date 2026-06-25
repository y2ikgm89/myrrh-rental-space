import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import type {
  AnalyticsType,
  DiscountCombinationMode,
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  LayoutWidth,
  TaxDisplayMode,
} from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import type { SidebarSettings } from "@/shared/lib/validations/sidebar";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { DurationDiscountRule } from "@/shared/lib/pricing/types";
export type BasicInfoInput = {
  siteName: string | null;
  siteDescription: string | null;
  faviconUrl: string;
  defaultOgpImageUrl: string | null;
  headerLogoUrl: string | null;
  footerLogoUrl: string | null;
  footerCopyright: string | null;
  useHeaderLogo: boolean;
  useFooterLogo: boolean;
};

export type LayoutSettingsInput = {
  containerWidth: LayoutWidth;
  containerWidthCustom: number | null;
  contentWidth: LayoutWidth;
  contentWidthCustom: number | null;
};

export type MetaSettingsInput = {
  defaultMetaDescription: string | null;
  defaultMetaKeywords: string | null;
  defaultOgpTitle: string | null;
  defaultOgpDescription: string | null;
};

export type AnalyticsSettingsInput = {
  analyticsType: AnalyticsType | null;
  googleAnalyticsId: string | null;
  googleTagManagerId: string | null;
  gaPropertyId: string | null;
  microsoftClarityId: string | null;
};

export type SearchVerificationInput = {
  googleSearchConsoleId: string | null;
  bingWebmasterToolsId: string | null;
};

export type BusinessInfoInput = {
  businessName: string | null;
  businessNameKana: string | null;
  representativeName: string | null;
  establishedDate: string | null;
  registrationNumber: string | null;
  invoiceNumber: string | null;
  businessDescription: string | null;
};

export type ContactInfoInput = {
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  // 交通案内・駐車場案内は Location 単位で管理（Settings からは廃止済）
};

export type BusinessHoursSettingsInput = {
  businessHours: BusinessHours;
  regularHolidays: string[] | null;
  holidayNotice: string | null;
};

export type EmailSettingsInput = {
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  sendReservationConfirmationEmail: boolean;
  notificationStaffIds: string[];
  notificationEmailAddresses: string | null;
};

export type NotificationSettingsInput = {
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notifyEventRegistration: boolean;
  notifyEventCancellation: boolean;
};

export type MaintenanceSettingsInput = {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
};

export type CookieConsentSettingsInput = {
  cookieConsentEnabled: boolean;
  cookieConsentMessage: string | null;
  cookieConsentAcceptText: string | null;
  cookieConsentRejectText: string | null;
  cookieConsentPolicyUrl: string | null;
};

export type ReservationSettingsInput = {
  defaultTimeSlot: number;
  minReservationDuration: number;
  maxReservationDuration: number;
  cancellationDeadlineHours: number;
  modificationDeadlineHours: number;
};

export type HeaderSettingsInput = {
  headerScrollBehavior: HeaderScrollBehavior;
  headerBackgroundMode: HeaderBackgroundMode;
};

export type DiscountSettingsInput = {
  durationDiscountEnabled: boolean;
  durationDiscountRules: DurationDiscountRule[];
  discountCombinationMode: DiscountCombinationMode;
  showOriginalPrice: boolean;
};

export type TaxSettingsInput = {
  taxStandardRate: number;
  taxReducedRate: number;
  taxDisplayModePublic: TaxDisplayMode;
};

function normalizeNullableString(value: string | null): string | null {
  return value || null;
}

export async function updateBasicInfo(data: BasicInfoInput): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateLayoutSettings(
  data: LayoutSettingsInput,
): Promise<void> {
  if (data.containerWidth === "CUSTOM" && !data.containerWidthCustom) {
    throw new DomainError(
      "Container幅のカスタム値を入力してください",
      "VALIDATION",
    );
  }
  if (data.contentWidth === "CUSTOM" && !data.contentWidthCustom) {
    throw new DomainError(
      "コンテンツ幅のカスタム値を入力してください",
      "VALIDATION",
    );
  }

  const updateData = {
    containerWidth: data.containerWidth,
    containerWidthCustom:
      data.containerWidth === "CUSTOM" ? data.containerWidthCustom : null,
    contentWidth: data.contentWidth,
    contentWidthCustom:
      data.contentWidth === "CUSTOM" ? data.contentWidthCustom : null,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateMetaSettings(
  data: MetaSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateAnalyticsSettings(
  data: AnalyticsSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateSearchVerification(
  data: SearchVerificationInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateBusinessInfo(
  data: BusinessInfoInput,
): Promise<void> {
  const updateData = {
    ...data,
    establishedDate: data.establishedDate
      ? new Date(data.establishedDate)
      : null,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateContactInfo(data: ContactInfoInput): Promise<void> {
  const updateData = {
    ...data,
    email: normalizeNullableString(data.email),
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateBusinessHoursSettings(
  data: BusinessHoursSettingsInput,
): Promise<void> {
  const updateData = {
    businessHours: data.businessHours,
    regularHolidays: data.regularHolidays ?? Prisma.JsonNull,
    holidayNotice: data.holidayNotice,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateEmailSettings(
  data: EmailSettingsInput,
): Promise<void> {
  const updateData = {
    ...data,
    senderEmail: normalizeNullableString(data.senderEmail),
    senderName: normalizeNullableString(data.senderName),
    replyToEmail: normalizeNullableString(data.replyToEmail),
    notificationStaffIds: asPrismaInputJsonValue(
      data.notificationStaffIds,
      "通知先スタッフの形式が不正です",
    ),
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateNotificationSettings(
  data: NotificationSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateMaintenanceSettings(
  data: MaintenanceSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateCookieConsentSettings(
  data: CookieConsentSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateReservationSettings(
  data: ReservationSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateSidebarSettings(
  data: SidebarSettings,
): Promise<void> {
  const updateData = {
    sidebarEnabled: data.sidebarEnabled,
    sidebarWidgets: data.sidebarWidgets,
    sidebarRecentCount: data.sidebarRecentCount,
    sidebarPopularCount: data.sidebarPopularCount,
    sidebarTocEnabled: data.sidebarTocEnabled,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateHeaderSettings(
  data: HeaderSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export type FooterSettingsInput = {
  footerTagline: string | null;
  footerNavigationLabel: string;
  footerContactLabel: string;
  footerHoursLabel: string;
  footerShowSocialLinks: boolean;
  themeColor: string;
};

export async function updateFooterSettings(
  data: FooterSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateDiscountSettings(
  data: DiscountSettingsInput,
): Promise<void> {
  const hourSet = new Set<number>();
  for (const rule of data.durationDiscountRules) {
    if (hourSet.has(rule.hours)) {
      throw new DomainError(
        `${rule.hours}時間の割引ルールが重複しています`,
        "VALIDATION",
      );
    }
    hourSet.add(rule.hours);
  }

  const updateData = {
    durationDiscountEnabled: data.durationDiscountEnabled,
    durationDiscountRules: asPrismaInputJsonValue(
      data.durationDiscountRules,
      "割引ルールの形式が不正です",
    ),
    discountCombinationMode: data.discountCombinationMode,
    showOriginalPrice: data.showOriginalPrice,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateTaxSettings(data: TaxSettingsInput): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateEventImportEnabled(
  enabled: boolean,
): Promise<void> {
  await prisma.settings.updateMany({
    data: { eventImportEnabled: enabled },
  });
}

/**
 * Feature Module ON/OFF map を Settings.featureModules JSON column に書き込む。
 *
 * 入力は schema 層（`featureModulesSettingsSchema`）で全 9 module の boolean 必須に
 * 検証済みのため、ここでは純粋な write を行うのみ。依存解決は read 側
 * (`@/shared/lib/features/check.ts` の `getEnabledFeatures`) で行う。
 */
export async function updateFeatureModulesCommand(
  modules: Record<string, boolean>,
): Promise<void> {
  await prisma.settings.updateMany({
    data: {
      featureModules: asPrismaInputJsonValue(
        modules,
        "featureModules が不正です",
      ),
    },
  });
}

// Re-export integration commands (Stripe, Google Calendar, iCal)
export * from "./integration-commands";
