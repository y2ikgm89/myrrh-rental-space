import "server-only";

import { randomBytes } from "node:crypto";
import { Prisma, prisma } from "@/shared/db/prisma";
import type {
  AnalyticsType,
  CalendarSyncMethod,
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
import { omitUndefined } from "@/shared/lib/serialize";
import type { SidebarSettings } from "@/shared/lib/validations/sidebar";
import { encrypt } from "@/shared/lib/crypto";
import { encryptServiceAccountJson } from "@/shared/lib/google-calendar/service-account";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";
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

export type StripeSettingsInput = {
  stripeEnabled: boolean;
  stripeTestMode: boolean;
  stripePublishableKey?: string | null | undefined;
  stripeSecretKey?: string | null | undefined;
  stripeWebhookSecret?: string | null | undefined;
  stripeCurrency: string;
};

export type GoogleCalendarSettingsInput = {
  googleCalendarEnabled: boolean;
  googleCalendarId: string | null;
  serviceAccountJson: string | null;
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
};

export type TwoWaySyncSettingsInput = {
  enabled: boolean;
  syncMethod: CalendarSyncMethod;
  pollingIntervalMin: number;
};

export type GoogleCalendarWebhookInput = {
  channelId: string;
  resourceId: string;
  expiration: Date | undefined;
};

export type ICalTokenCreateInput = {
  name: string;
  spaceId: string | null;
  expiresInDays: number | null;
  createdBy: string;
};

export type ICalFeedSettingsInput = {
  icalFeedEnabled: boolean;
  icalFeedIncludeCustomerInfo: boolean;
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

export async function updateStripeSettings(
  data: StripeSettingsInput,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    stripeEnabled: data.stripeEnabled,
    stripeTestMode: data.stripeTestMode,
    stripePublishableKey: data.stripePublishableKey || null,
    stripeCurrency: data.stripeCurrency,
  };

  if (data.stripeSecretKey) {
    try {
      updateData["stripeSecretKey"] = encrypt(data.stripeSecretKey);
    } catch {
      throw new DomainError(
        "シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
        "VALIDATION",
      );
    }
  }

  if (data.stripeWebhookSecret) {
    try {
      updateData["stripeWebhookSecret"] = encrypt(data.stripeWebhookSecret);
    } catch {
      throw new DomainError(
        "Webhookシークレットの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
        "VALIDATION",
      );
    }
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function recordStripeConnectionSuccess(
  accountId: string | undefined,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: omitUndefined({
      id: "singleton",
      stripeLastTestedAt: new Date(),
      stripeConnectionStatus: "connected",
      stripeAccountId: accountId,
    }),
    update: omitUndefined({
      stripeLastTestedAt: new Date(),
      stripeConnectionStatus: "connected",
      stripeAccountId: accountId,
    }),
  });
}

export async function clearStripeKeys(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeConnectionStatus: null,
      stripeLastTestedAt: null,
    },
    update: {
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeConnectionStatus: null,
      stripeLastTestedAt: null,
    },
  });
}

export async function updateGoogleCalendarSettings(
  data: GoogleCalendarSettingsInput,
): Promise<void> {
  const updateData: Record<string, unknown> = {
    googleCalendarEnabled: data.googleCalendarEnabled,
    googleCalendarId: normalizeNullableString(data.googleCalendarId),
    icalAttachmentEnabled: data.icalAttachmentEnabled,
    addToCalendarLinksEnabled: data.addToCalendarLinksEnabled,
  };

  if (data.serviceAccountJson) {
    if (!parseGoogleServiceAccountCredentials(data.serviceAccountJson)) {
      throw new DomainError(
        "サービスアカウントJSONの形式が無効です",
        "VALIDATION",
      );
    }

    updateData["googleCalendarServiceAccountJson"] = encryptServiceAccountJson(
      data.serviceAccountJson,
    );
    updateData["googleCalendarConnectionStatus"] = null;
    updateData["googleCalendarLastTestedAt"] = null;
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function recordGoogleCalendarConnectionSuccess(): Promise<void> {
  const testedAt = new Date();

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "connected",
    },
    update: {
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "connected",
    },
  });
}

export async function recordGoogleCalendarConnectionError(): Promise<void> {
  const testedAt = new Date();

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "error",
    },
    update: {
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "error",
    },
  });
}

export async function enableGoogleCalendarOAuth(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleCalendarOAuthEnabled: true },
    update: { googleCalendarOAuthEnabled: true },
  });
}

export async function clearGoogleCalendarServiceAccount(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
    update: {
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
  });
}

export async function disconnectGoogleCalendarOAuth(
  userId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.account.deleteMany({
      where: {
        userId,
        providerId: "google",
      },
    });

    await tx.settings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", googleCalendarOAuthEnabled: false },
      update: { googleCalendarOAuthEnabled: false },
    });
  });
}

export async function updateTwoWaySyncSettings(
  data: TwoWaySyncSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarTwoWaySyncEnabled: data.enabled,
      googleCalendarSyncMethod: data.syncMethod,
      googleCalendarPollingIntervalMin: data.pollingIntervalMin,
    },
    update: {
      googleCalendarTwoWaySyncEnabled: data.enabled,
      googleCalendarSyncMethod: data.syncMethod,
      googleCalendarPollingIntervalMin: data.pollingIntervalMin,
    },
  });
}

export async function saveGoogleCalendarWebhookToken(
  token: string,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleCalendarWebhookToken: token },
    update: { googleCalendarWebhookToken: token },
  });
}

export async function saveGoogleCalendarWebhook(
  data: GoogleCalendarWebhookInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarWebhookChannelId: data.channelId,
      googleCalendarWebhookResourceId: data.resourceId,
      googleCalendarWebhookExpiration: data.expiration ?? null,
    },
    update: {
      googleCalendarWebhookChannelId: data.channelId,
      googleCalendarWebhookResourceId: data.resourceId,
      googleCalendarWebhookExpiration: data.expiration ?? null,
    },
  });
}

export async function clearGoogleCalendarWebhook(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarWebhookChannelId: null,
      googleCalendarWebhookResourceId: null,
      googleCalendarWebhookToken: null,
      googleCalendarWebhookExpiration: null,
    },
    update: {
      googleCalendarWebhookChannelId: null,
      googleCalendarWebhookResourceId: null,
      googleCalendarWebhookToken: null,
      googleCalendarWebhookExpiration: null,
    },
  });
}

export async function createICalToken(
  data: ICalTokenCreateInput,
): Promise<{ id: string; token: string }> {
  if (data.spaceId) {
    const space = await prisma.space.findUnique({
      where: { id: data.spaceId },
      select: { id: true },
    });

    if (!space) {
      throw new DomainError("スペースが見つかりません", "VALIDATION");
    }
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt =
    data.expiresInDays && data.expiresInDays > 0
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const created = await prisma.iCalToken.create({
    data: {
      token,
      name: data.name,
      spaceId: data.spaceId,
      createdBy: data.createdBy,
      expiresAt,
    },
    select: {
      id: true,
      token: true,
    },
  });

  return created;
}

export async function deleteICalToken(id: string): Promise<void> {
  const token = await prisma.iCalToken.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!token) {
    throw new DomainError("トークンが見つかりません", "NOT_FOUND");
  }

  await prisma.iCalToken.delete({ where: { id } });
}

export async function updateICalFeedSettings(
  data: ICalFeedSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}
