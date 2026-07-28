import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands/optimistic";
import { omitUndefined } from "@/shared/lib/serialize";
import { encrypt, safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { keysHaveMatchingMode } from "@/shared/lib/stripe-shared";

export type StripeSettingsInput = {
  stripePublishableKey?: string | null | undefined;
  stripeSecretKey?: string | null | undefined;
  stripeWebhookSecret?: string | null | undefined;
  stripeCurrency: string;
  stripePaymentMethodTypes: readonly string[];
  /** 楽観的 concurrency: 読み込み時の SettingsStripe.updatedAt */
  expectedUpdatedAt: string | Date;
};

export async function updateStripeSettings(
  data: StripeSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);

  const existing = await prisma.settingsStripe.findUnique({
    where: { id: "singleton" },
    select: {
      stripePublishableKey: true,
      stripeSecretKey: true,
    },
  });

  const existingSecretDecrypted = existing?.stripeSecretKey
    ? safeDecryptToString(existing.stripeSecretKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
      })
    : null;

  const finalPublishableKey =
    data.stripePublishableKey ?? existing?.stripePublishableKey ?? null;
  const finalSecretKey =
    data.stripeSecretKey ?? existingSecretDecrypted ?? null;

  if (finalPublishableKey && finalSecretKey) {
    if (!keysHaveMatchingMode(finalPublishableKey, finalSecretKey)) {
      throw new DomainError(
        "公開可能キーとシークレットキーのモード（test/live）が一致していません",
        "VALIDATION",
      );
    }
  }

  const updateData: Omit<Prisma.SettingsStripeCreateInput, "id"> = {
    stripeCurrency: data.stripeCurrency,
    stripePaymentMethodTypes: Array.from(data.stripePaymentMethodTypes),
  };

  if (data.stripePublishableKey) {
    updateData.stripePublishableKey = data.stripePublishableKey;
  }

  if (data.stripeSecretKey) {
    try {
      updateData.stripeSecretKey = encrypt(data.stripeSecretKey, {
        purpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
      });
    } catch {
      throw new DomainError(
        "シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
        "VALIDATION",
      );
    }
  }

  if (data.stripeWebhookSecret) {
    try {
      updateData.stripeWebhookSecret = encrypt(data.stripeWebhookSecret, {
        purpose: SETTINGS_CRYPTO_PURPOSES.stripeWebhookSecret,
      });
    } catch {
      throw new DomainError(
        "Webhookシークレットの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
        "VALIDATION",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.settingsStripe.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const result = await tx.settingsStripe.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function recordStripeConnectionSuccess(
  accountId: string | undefined,
): Promise<void> {
  await prisma.settingsStripe.upsert({
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
  await prisma.settingsStripe.upsert({
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
