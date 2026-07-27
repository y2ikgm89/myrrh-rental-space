import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import type {
  HeaderBackgroundMode,
  HeaderScrollBehavior,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import type { SidebarSettings } from "@/shared/lib/validations/sidebar";
import {
  parseFeatureModules,
  type DataRetentionConfig,
} from "@/shared/lib/json-validators";
import {
  normalizeFeatureModules,
  type FeatureModule,
} from "@/shared/lib/features/registry";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands/optimistic";

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
