import "server-only";

import { prisma } from "@/shared/db/prisma";
import type {
  AnalyticsType,
  LayoutWidth,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllowedManagedImageUrls } from "@/shared/domain/media/managed-image-assertions";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands";

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
