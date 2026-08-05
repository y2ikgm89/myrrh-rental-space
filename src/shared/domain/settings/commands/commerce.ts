import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import type {
  DiscountCombinationMode,
  TaxDisplayMode,
} from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import type { DurationDiscountRule } from "@/shared/lib/pricing/types";
import type { RefundPolicy } from "@/shared/domain/refund/policy";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands/optimistic";

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
 * - `policy === null` → `Prisma.DbNull`（SQL NULL）を書き込み「policy 未設定」に戻す
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
        ? Prisma.DbNull
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
