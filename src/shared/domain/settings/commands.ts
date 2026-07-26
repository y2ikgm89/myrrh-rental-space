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
import { assertAllowlistedNotificationStaffIds } from "@/shared/domain/settings/notification-staff";
import { assertAllowedManagedImageUrls } from "@/shared/domain/media/managed-image-assertions";
import type { SidebarSettings } from "@/shared/lib/validations/sidebar";
import {
  parseFeatureModules,
  type BusinessHours,
  type DataRetentionConfig,
} from "@/shared/lib/json-validators";
import type { DurationDiscountRule } from "@/shared/lib/pricing/types";
import type { RefundPolicy } from "@/shared/domain/refund/policy";
import { DEFAULT_BUSINESS_HOURS_WEEK } from "@/shared/lib/business-hours";
import {
  buildInitialFeatureModules,
  normalizeFeatureModules,
  type FeatureModule,
} from "@/shared/lib/features/registry";

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
  /** 楽観的 concurrency: 読み込み時の SettingsLayout.updatedAt */
  expectedUpdatedAt: string | Date;
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
  /** 楽観的 concurrency: 読み込み時の SettingsOrganization.updatedAt */
  expectedUpdatedAt: string | Date;
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
  holidayNotice: string | null;
  /** 楽観的 concurrency: 読み込み時の SettingsOrganization.updatedAt */
  expectedUpdatedAt: string | Date;
};

export type EmailSettingsInput = {
  senderEmail: string | null;
  senderName: string | null;
  replyToEmail: string | null;
  sendReservationConfirmationEmail: boolean;
  notifyEventReminder: boolean;
  notificationStaffIds: string[];
  notificationEmailAddresses: string[];
  /** 楽観的 concurrency: 読み込み時の SettingsOrganization.updatedAt */
  expectedOrganizationUpdatedAt: string | Date;
  /** 楽観的 concurrency: 読み込み時の SettingsReservation.updatedAt */
  expectedReservationUpdatedAt: string | Date;
  /** 楽観的 concurrency: 読み込み時の SettingsNotification.updatedAt */
  expectedNotificationUpdatedAt: string | Date;
};

export type NotificationSettingsInput = {
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notifyInquiryCustomerReply: boolean;
  notifyEventRegistration: boolean;
  notifyEventWaitlistRegistration: boolean;
  notifyEventCancellation: boolean;
  /** 楽観的 concurrency: 読み込み時の SettingsNotification.updatedAt */
  expectedUpdatedAt: string | Date;
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
  customerCanCancelSeriesInFull: boolean;
  maxRecurrenceInstances: number;
  /** 楽観的 concurrency: 読み込み時の SettingsReservation.updatedAt */
  expectedUpdatedAt: string | Date;
};

/** Business Settings 楽観的 concurrency 競合時の共通メッセージ */
export const SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE =
  "他のユーザーにより更新されています。ページを再読み込みしてください";

export function toExpectedUpdatedAt(value: string | Date): Date {
  const expected = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(expected.getTime())) {
    throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
  }
  return expected;
}

async function casUpdateOrCreateSingleton<
  TUpdate extends Record<string, unknown>,
  TCreate extends Record<string, unknown>,
>({
  updateMany,
  findUnique,
  create,
  expectedUpdatedAt,
  updateData,
  createData,
}: {
  updateMany: (args: {
    where: { id: "singleton"; updatedAt: Date };
    data: TUpdate;
  }) => Promise<{ count: number }>;
  findUnique: (args: {
    where: { id: "singleton" };
    select: { id: true };
  }) => Promise<{ id: string } | null>;
  create: (args: { data: TCreate }) => Promise<unknown>;
  expectedUpdatedAt: Date;
  updateData: TUpdate;
  createData: TCreate;
}): Promise<void> {
  const result = await updateMany({
    where: { id: "singleton", updatedAt: expectedUpdatedAt },
    data: updateData,
  });
  if (result.count > 0) {
    return;
  }

  const existing = await findUnique({
    where: { id: "singleton" },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
  }

  await create({ data: createData });
}

/** Feature Module `data-retention` を OFF→ON する際の確認不足メッセージ */
export const DATA_RETENTION_ENABLE_CONFIRMATION_MESSAGE =
  "データ保持ポリシーの自動適用を有効にするには、保持期間経過後の削除・匿名化のリスクを理解したうえで確認チェックボックスにチェックを入れてください。";

export type FeatureModulesCommandInput = Record<FeatureModule, boolean> & {
  confirmDataRetentionEnable: boolean;
  expectedUpdatedAt: string | Date;
};

export type DataRetentionSettingsCommandInput = DataRetentionConfig & {
  expectedUpdatedAt: string | Date;
};

export type HeaderSettingsInput = {
  headerScrollBehavior: HeaderScrollBehavior;
  headerBackgroundMode: HeaderBackgroundMode;
  /** 楽観的 concurrency: 読み込み時の SettingsLayout.updatedAt */
  expectedUpdatedAt: string | Date;
};

export type DiscountSettingsInput = {
  durationDiscountEnabled: boolean;
  durationDiscountRules: DurationDiscountRule[];
  discountCombinationMode: DiscountCombinationMode;
  showOriginalPrice: boolean;
  /** 楽観的 concurrency: 読み込み時の SettingsCommerce.updatedAt */
  expectedUpdatedAt: string | Date;
};

export type TaxSettingsInput = {
  taxStandardRate: number;
  taxReducedRate: number;
  taxDisplayModePublic: TaxDisplayMode;
  /** 楽観的 concurrency: 読み込み時の SettingsCommerce.updatedAt */
  expectedUpdatedAt: string | Date;
};

export type RefundPolicyUpdateInput = {
  policy: RefundPolicy | null;
  /** 楽観的 concurrency: 読み込み時の SettingsCommerce.updatedAt */
  expectedUpdatedAt: string | Date;
};

function normalizeNullableString(value: string | null): string | null {
  return value || null;
}

const CONTAINER_CUSTOM_WIDTH_MIN = 320;
const CONTAINER_CUSTOM_WIDTH_MAX = 2560;
const CONTENT_CUSTOM_WIDTH_MIN = 320;
const CONTENT_CUSTOM_WIDTH_MAX = 1920;

function assertCustomWidthInRange(
  value: number | null,
  min: number,
  max: number,
  label: string,
): number {
  if (
    value === null ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new DomainError(
      `${label}は${min}px〜${max}pxの範囲で入力してください`,
      "VALIDATION",
    );
  }
  return value;
}

export async function updateBasicInfo(data: BasicInfoInput): Promise<void> {
  assertAllowedManagedImageUrls([
    { label: "ファビコン画像", url: data.faviconUrl },
    { label: "デフォルトOGP画像", url: data.defaultOgpImageUrl },
    { label: "ヘッダーロゴ画像", url: data.headerLogoUrl },
    { label: "フッターロゴ画像", url: data.footerLogoUrl },
  ]);

  await prisma.settingsSeo.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateLayoutSettings(
  data: LayoutSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);

  let containerWidthCustom: number | null = null;
  if (data.containerWidth === "CUSTOM") {
    if (data.containerWidthCustom === null) {
      throw new DomainError(
        "Container幅のカスタム値を入力してください",
        "VALIDATION",
      );
    }
    containerWidthCustom = assertCustomWidthInRange(
      data.containerWidthCustom,
      CONTAINER_CUSTOM_WIDTH_MIN,
      CONTAINER_CUSTOM_WIDTH_MAX,
      "Container幅",
    );
  }

  let contentWidthCustom: number | null = null;
  if (data.contentWidth === "CUSTOM") {
    if (data.contentWidthCustom === null) {
      throw new DomainError(
        "コンテンツ幅のカスタム値を入力してください",
        "VALIDATION",
      );
    }
    contentWidthCustom = assertCustomWidthInRange(
      data.contentWidthCustom,
      CONTENT_CUSTOM_WIDTH_MIN,
      CONTENT_CUSTOM_WIDTH_MAX,
      "コンテンツ幅",
    );
  }

  const updateData = {
    containerWidth: data.containerWidth,
    containerWidthCustom,
    contentWidth: data.contentWidth,
    contentWidthCustom,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsLayout.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateMetaSettings(
  data: MetaSettingsInput,
): Promise<void> {
  await prisma.settingsSeo.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateAnalyticsSettings(
  data: AnalyticsSettingsInput,
): Promise<void> {
  await prisma.settingsAnalytics.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateSearchVerification(
  data: SearchVerificationInput,
): Promise<void> {
  await prisma.settingsAnalytics.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateBusinessInfo(
  data: BusinessInfoInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    businessName: data.businessName,
    businessNameKana: data.businessNameKana,
    representativeName: data.representativeName,
    establishedDate: data.establishedDate
      ? new Date(data.establishedDate)
      : null,
    registrationNumber: data.registrationNumber,
    invoiceNumber: data.invoiceNumber,
    businessDescription: data.businessDescription,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsOrganization.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateContactInfo(data: ContactInfoInput): Promise<void> {
  const updateData = {
    ...data,
    email: normalizeNullableString(data.email),
  };

  await prisma.settingsOrganization.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function updateBusinessHoursSettings(
  data: BusinessHoursSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    businessHours: data.businessHours,
    holidayNotice: data.holidayNotice,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsOrganization.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateEmailSettings(
  data: EmailSettingsInput,
): Promise<void> {
  const notificationStaffIds = await assertAllowlistedNotificationStaffIds(
    data.notificationStaffIds,
  );
  const expectedOrganizationUpdatedAt = toExpectedUpdatedAt(
    data.expectedOrganizationUpdatedAt,
  );
  const expectedReservationUpdatedAt = toExpectedUpdatedAt(
    data.expectedReservationUpdatedAt,
  );
  const expectedNotificationUpdatedAt = toExpectedUpdatedAt(
    data.expectedNotificationUpdatedAt,
  );

  const organizationData = {
    senderEmail: normalizeNullableString(data.senderEmail),
    senderName: normalizeNullableString(data.senderName),
    replyToEmail: normalizeNullableString(data.replyToEmail),
  };
  const reservationData = {
    sendReservationConfirmationEmail: data.sendReservationConfirmationEmail,
  };
  const notificationData = {
    notifyEventReminder: data.notifyEventReminder,
    notificationStaffIds,
    notificationEmailAddresses: data.notificationEmailAddresses,
  };

  await prisma.$transaction(async (tx) => {
    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsOrganization.updateMany(args),
      findUnique: (args) => tx.settingsOrganization.findUnique(args),
      create: (args) => tx.settingsOrganization.create(args),
      expectedUpdatedAt: expectedOrganizationUpdatedAt,
      updateData: organizationData,
      createData: { id: "singleton", ...organizationData },
    });

    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsReservation.updateMany(args),
      findUnique: (args) => tx.settingsReservation.findUnique(args),
      create: (args) => tx.settingsReservation.create(args),
      expectedUpdatedAt: expectedReservationUpdatedAt,
      updateData: reservationData,
      createData: { id: "singleton", ...reservationData },
    });

    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsNotification.updateMany(args),
      findUnique: (args) => tx.settingsNotification.findUnique(args),
      create: (args) => tx.settingsNotification.create(args),
      expectedUpdatedAt: expectedNotificationUpdatedAt,
      updateData: notificationData,
      createData: { id: "singleton", ...notificationData },
    });
  });
}

export async function updateNotificationSettings(
  data: NotificationSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    notifyNewReservation: data.notifyNewReservation,
    notifyReservationChange: data.notifyReservationChange,
    notifyReservationCancel: data.notifyReservationCancel,
    notifyNewInquiry: data.notifyNewInquiry,
    notifyInquiryCustomerReply: data.notifyInquiryCustomerReply,
    notifyEventRegistration: data.notifyEventRegistration,
    notifyEventWaitlistRegistration: data.notifyEventWaitlistRegistration,
    notifyEventCancellation: data.notifyEventCancellation,
  };

  await prisma.$transaction(async (tx) => {
    await casUpdateOrCreateSingleton({
      updateMany: (args) => tx.settingsNotification.updateMany(args),
      findUnique: (args) => tx.settingsNotification.findUnique(args),
      create: (args) => tx.settingsNotification.create(args),
      expectedUpdatedAt,
      updateData,
      createData: { id: "singleton", ...updateData },
    });
  });
}

export async function ensureSettingsSystem() {
  return prisma.settingsSystem.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsSeo() {
  return prisma.settingsSeo.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsAnalytics() {
  return prisma.settingsAnalytics.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsLayout() {
  return prisma.settingsLayout.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsSidebar() {
  return prisma.settingsSidebar.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsOrganization() {
  return prisma.settingsOrganization.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      businessHours: asPrismaInputJsonValue(
        DEFAULT_BUSINESS_HOURS_WEEK,
        "businessHours が不正です",
      ),
    },
  });
}

export async function ensureSettingsCommerce() {
  return prisma.settingsCommerce.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsNotification() {
  return prisma.settingsNotification.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsReservation() {
  return prisma.settingsReservation.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsStripe() {
  return prisma.settingsStripe.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsResend() {
  return prisma.settingsResend.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsTurnstile() {
  return prisma.settingsTurnstile.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsGoogleMaps() {
  return prisma.settingsGoogleMaps.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsGoogleCalendar() {
  return prisma.settingsGoogleCalendar.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsGoogleBusinessProfile() {
  return prisma.settingsGoogleBusinessProfile.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsInstagram() {
  return prisma.settingsInstagram.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsSwitchbot() {
  return prisma.settingsSwitchbot.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function ensureSettingsFeatures() {
  const featureModules = asPrismaInputJsonValue(
    buildInitialFeatureModules(),
    "featureModules が不正です",
  );

  return prisma.settingsFeatures.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton", featureModules },
  });
}

export async function ensureSettingsDataRetention() {
  return prisma.settingsDataRetention.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function updateMaintenanceSettings(
  data: MaintenanceSettingsInput,
): Promise<void> {
  await prisma.settingsSystem.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateCookieConsentSettings(
  data: CookieConsentSettingsInput,
): Promise<void> {
  await prisma.settingsSystem.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}

export async function updateReservationSettings(
  data: ReservationSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    defaultTimeSlot: data.defaultTimeSlot,
    minReservationDuration: data.minReservationDuration,
    maxReservationDuration: data.maxReservationDuration,
    cancellationDeadlineHours: data.cancellationDeadlineHours,
    modificationDeadlineHours: data.modificationDeadlineHours,
    customerCanCancelSeriesInFull: data.customerCanCancelSeriesInFull,
    maxRecurrenceInstances: data.maxRecurrenceInstances,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsReservation.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateSidebarSettings(
  data: SidebarSettings,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    sidebarEnabled: data.sidebarEnabled,
    sidebarWidgets: data.sidebarWidgets,
    sidebarRecentCount: data.sidebarRecentCount,
    sidebarPopularCount: data.sidebarPopularCount,
    sidebarTocEnabled: data.sidebarTocEnabled,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsSidebar.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateHeaderSettings(
  data: HeaderSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    headerScrollBehavior: data.headerScrollBehavior,
    headerBackgroundMode: data.headerBackgroundMode,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsLayout.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export type FooterSettingsInput = {
  footerTagline: string | null;
  footerNavigationLabel: string;
  footerContactLabel: string;
  footerHoursLabel: string;
  footerShowSocialLinks: boolean;
  themeColor: string;
  /** 楽観的 concurrency: 読み込み時の SettingsLayout.updatedAt */
  expectedUpdatedAt: string | Date;
};

export async function updateFooterSettings(
  data: FooterSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    footerTagline: data.footerTagline,
    footerNavigationLabel: data.footerNavigationLabel,
    footerContactLabel: data.footerContactLabel,
    footerHoursLabel: data.footerHoursLabel,
    footerShowSocialLinks: data.footerShowSocialLinks,
    themeColor: data.themeColor,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsLayout.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateDiscountSettings(
  data: DiscountSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
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

  await prisma.$transaction(async (tx) => {
    await tx.settingsCommerce.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const result = await tx.settingsCommerce.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateTaxSettings(data: TaxSettingsInput): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    taxStandardRate: data.taxStandardRate,
    taxReducedRate: data.taxReducedRate,
    taxDisplayModePublic: data.taxDisplayModePublic,
  };

  await prisma.$transaction(async (tx) => {
    await tx.settingsCommerce.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const result = await tx.settingsCommerce.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

/**
 * `SettingsCommerce.refundPolicy` (Json?) を書き込む。
 *
 * - `policy === null` → `Prisma.JsonNull` を書き込み「policy 未設定」に戻す
 *   (cancellation-side-effects の unset = 残額全額自動返金)。
 * - `policy` が RefundPolicy shape → `asPrismaInputJsonValue` で JSON 化して write。
 *   resolveRefundPolicy 側の境界 check (hoursBefore >= 0, refundRate finite,
 *   defaultRefundRate finite) は書き込み前の schema 層で保証済みなので、ここでは
 *   純粋な upsert のみを行う。
 *
 * 参照: `src/shared/domain/refund/policy.ts` の resolveRefundPolicy / calculateRefundAmount。
 */
export async function updateRefundPolicy(
  data: RefundPolicyUpdateInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    refundPolicy:
      data.policy === null
        ? Prisma.JsonNull
        : asPrismaInputJsonValue(data.policy, "返金ポリシーの形式が不正です"),
  };

  await prisma.$transaction(async (tx) => {
    await tx.settingsCommerce.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const result = await tx.settingsCommerce.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function updateEventImportEnabled(
  enabled: boolean,
): Promise<void> {
  await prisma.settingsGoogleCalendar.update({
    where: { id: "singleton" },
    data: { eventImportEnabled: enabled },
  });
}

/**
 * Feature Module ON/OFF map を Settings.featureModules JSON column に書き込む。
 *
 * 入力は schema 層（`featureModulesSettingsSchema`）で全 11 module の boolean 必須に
 * 検証済み。persist 前に `normalizeFeatureModules` で依存 cascade を適用する（write-side SSoT）。
 *
 * `data-retention` を stored OFF から ON にする場合は `confirmDataRetentionEnable` 必須。
 */
export async function updateFeatureModulesCommand(
  data: FeatureModulesCommandInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const {
    confirmDataRetentionEnable,
    expectedUpdatedAt: _expectedUpdatedAt,
    ...modules
  } = data;
  const normalized = normalizeFeatureModules(modules);
  const featureModules = asPrismaInputJsonValue(
    normalized,
    "featureModules が不正です",
  );

  const existing = await prisma.settingsFeatures.findUnique({
    where: { id: "singleton" },
    select: { featureModules: true },
  });

  const previousStored = parseFeatureModules(existing?.featureModules);
  const isEnablingDataRetention =
    normalized["data-retention"] === true &&
    previousStored["data-retention"] !== true;

  if (isEnablingDataRetention && !confirmDataRetentionEnable) {
    throw new DomainError(
      DATA_RETENTION_ENABLE_CONFIRMATION_MESSAGE,
      "VALIDATION",
    );
  }

  if (!existing) {
    await prisma.settingsFeatures.create({
      data: { id: "singleton", featureModules },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsFeatures.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: { featureModules },
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

/**
 * データ保持ポリシー（保持月数）を SettingsDataRetention.dataRetention JSON に書き込む。
 *
 * 入力は schema 層（`dataRetentionSettingsSchema`）で全 6 key の非負整数必須に
 * 検証済み。`0` は該当テーブルの opt-out（cron 側で skip）。
 */
export async function updateDataRetentionSettings(
  data: DataRetentionSettingsCommandInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const { expectedUpdatedAt: _expectedUpdatedAt, ...config } = data;
  const dataRetention = asPrismaInputJsonValue(
    config,
    "dataRetention が不正です",
  );

  const existing = await prisma.settingsDataRetention.findUnique({
    where: { id: "singleton" },
    select: { id: true },
  });

  if (!existing) {
    await prisma.settingsDataRetention.create({
      data: { id: "singleton", dataRetention },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsDataRetention.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: { dataRetention },
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}
