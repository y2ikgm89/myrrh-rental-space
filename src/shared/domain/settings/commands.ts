import "server-only";

import { Prisma, prisma } from "@/shared/db/prisma";
import type {
  AnalyticsType,
  DiscountCombinationMode,
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  LayoutWidth,
  PostPermalinkStructure,
  TaxDisplayMode,
  TaxInputMode,
} from "@/shared/db/enums";
import { TermsStatus, TermsType } from "@/shared/db/enums";
import { DomainError } from "@/shared/domain/domain-error";
import type { SidebarSettings } from "@/shared/lib/validations/sidebar";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { DurationDiscountRule } from "@/shared/lib/pricing";
import { checkRobotsTxtWarnings } from "@/shared/domain/settings/robots-txt";

export type BasicInfoInput = {
  siteName: string | null;
  siteDescription: string | null;
  faviconUrl: string | null;
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
};

export type SearchVerificationInput = {
  googleSearchConsoleId: string | null;
  bingWebmasterToolsId: string | null;
};

export type BusinessInfoInput = {
  businessName: string | null;
  businessNameKana: string | null;
  representativeName: string | null;
  businessType: string | null;
  industryType: string | null;
  establishedDate: string | null;
  registrationNumber: string | null;
  invoiceNumber: string | null;
  businessDescription: string | null;
};

export type ContactInfoInput = {
  phoneNumber: string | null;
  faxNumber: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
};

export type BusinessHoursSettingsInput = {
  businessHours: BusinessHours;
  regularHolidays: string[] | null;
  specialHolidays: string[] | null;
  holidayNotice: string | null;
};

export type MeoSettingsInput = {
  latitude: number | null;
  longitude: number | null;
  priceRange: string | null;
  googleBusinessPlaceId: string | null;
  googleReviewUrl: string | null;
  businessAttributes: Record<string, boolean> | null;
  paymentAccepted: string | null;
};

export type EmailSettingsInput = {
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  sendReservationConfirmationEmail: boolean;
  sendAdminNotificationEmail: boolean;
  notificationEmailAddresses: string | null;
};

export type NotificationSettingsInput = {
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
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

export type TermsAgreementSettingsInput = {
  termsAgreementEnabled: boolean;
  termsAgreementText: string | null;
  requireTermsAgreement: boolean;
  requirePrivacyAgreement: boolean;
};

export type ReservationSettingsInput = {
  defaultTimeSlot: number;
  minReservationDuration: number;
  maxReservationDuration: number;
  cancellationTermsId: string | null;
};

export type SidebarSettingsInput = SidebarSettings;

export type PermalinkSettingsInput = {
  postPermalinkStructure: PostPermalinkStructure;
  postUrlPrefixEnabled: boolean;
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
  discountWarningEnabled: boolean;
};

export type TaxSettingsInput = {
  taxStandardRate: number;
  taxReducedRate: number;
  taxDisplayModeAdmin: TaxDisplayMode;
  taxDisplayModePublic: TaxDisplayMode;
  taxInputMode: TaxInputMode;
};

export type RobotsTxtSettingsInput = {
  robotsTxtEnabled: boolean;
  robotsTxtCustom: string | null;
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
    specialHolidays: data.specialHolidays ?? Prisma.JsonNull,
    holidayNotice: data.holidayNotice,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateMeoSettings(data: MeoSettingsInput): Promise<void> {
  const updateData = {
    latitude: data.latitude,
    longitude: data.longitude,
    priceRange: data.priceRange,
    googleBusinessPlaceId: data.googleBusinessPlaceId,
    googleReviewUrl: normalizeNullableString(data.googleReviewUrl),
    businessAttributes: data.businessAttributes ?? Prisma.JsonNull,
    paymentAccepted: normalizeNullableString(data.paymentAccepted),
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
    replyToEmail: normalizeNullableString(data.replyToEmail),
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

export async function updateTermsAgreementSettings(
  data: TermsAgreementSettingsInput,
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
  if (data.cancellationTermsId) {
    const terms = await prisma.terms.findFirst({
      where: {
        id: data.cancellationTermsId,
        type: TermsType.CANCELLATION,
        isActive: true,
        versions: {
          some: {
            status: TermsStatus.PUBLISHED,
          },
        },
      },
      select: { id: true },
    });

    if (!terms) {
      throw new DomainError(
        "指定されたキャンセルポリシーが見つかりません。有効な公開済みポリシーを選択してください。",
        "VALIDATION",
      );
    }
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateSidebarSettings(
  data: SidebarSettingsInput,
): Promise<void> {
  const updateData = {
    sidebarEnabled: data.sidebarEnabled,
    sidebarWidgets: data.sidebarWidgets,
    sidebarRecentCount: data.sidebarRecentCount,
    sidebarPopularCount: data.sidebarPopularCount,
  };

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updatePermalinkSettings(
  data: PermalinkSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
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
    durationDiscountRules: JSON.stringify(data.durationDiscountRules),
    discountCombinationMode: data.discountCombinationMode,
    showOriginalPrice: data.showOriginalPrice,
    discountWarningEnabled: data.discountWarningEnabled,
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

export async function updateRobotsTxtSettings(
  data: RobotsTxtSettingsInput,
): Promise<{ warnings: string[] }> {
  const warnings = data.robotsTxtCustom
    ? checkRobotsTxtWarnings(data.robotsTxtCustom)
    : [];

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return { warnings };
}

export async function resetRobotsTxtToDefault(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", robotsTxtEnabled: false, robotsTxtCustom: null },
    update: { robotsTxtEnabled: false, robotsTxtCustom: null },
  });
}

// Re-export integration commands (Stripe, Google Calendar, iCal)
export * from "./integration-commands";
