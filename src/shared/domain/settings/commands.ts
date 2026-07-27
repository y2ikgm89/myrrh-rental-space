import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import type {
  DiscountCombinationMode,
  HeaderBackgroundMode,
  HeaderScrollBehavior,
  TaxDisplayMode,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import type { SidebarSettings } from "@/shared/lib/validations/sidebar";
import {
  parseFeatureModules,
  type DataRetentionConfig,
} from "@/shared/lib/json-validators";
import type { DurationDiscountRule } from "@/shared/lib/pricing/types";
import type { RefundPolicy } from "@/shared/domain/refund/policy";
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
