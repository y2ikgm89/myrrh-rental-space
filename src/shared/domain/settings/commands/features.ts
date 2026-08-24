import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { DomainError } from "@/shared/domain/domain-error";
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
 * 入力は schema 層（`dataRetentionSettingsSchema`）で全 7 key の非負整数必須に
 * 検証済み。`0` は該当テーブルの opt-out（cron 側で skip）。
 *
 * ここは常に全 key を書き戻すので、保存を 1 度通せば JSON に欠損 key は残らない。
 * 読み側（`parseDataRetentionConfig`）が欠損を key 単位で吸収するのは、
 * **まだ一度も保存していない**行のため。
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
