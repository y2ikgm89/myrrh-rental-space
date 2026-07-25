import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";

/**
 * Stripe の公開設定（publishable key / 通貨 / 接続状態など）を返す。
 * secret / webhook secret の ciphertext は `'use cache'` に載せない（rotation 即時反映のため）。
 */
export async function getStripeSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.INTEGRATION_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settingsStripe.findUnique({
        where: { id: "singleton" },
        select: {
          stripePublishableKey: true,
          stripeAccountId: true,
          stripeCurrency: true,
          stripePaymentMethodTypes: true,
          stripeLastTestedAt: true,
          stripeConnectionStatus: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getStripeSettings",
  });

  return toPlainObject(result);
}

/**
 * Stripe secret / webhook secret の暗号化値をキャッシュせずに読む。
 * 復号済み plaintext を data cache に貯めないため rotation / kill switch の即時反映を保証する。
 */
export async function getStripeCredentialCiphertext(): Promise<{
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
} | null> {
  const result = await safeFetch({
    fetch: () =>
      prisma.settingsStripe.findUnique({
        where: { id: "singleton" },
        select: {
          stripeSecretKey: true,
          stripeWebhookSecret: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getStripeCredentialCiphertext",
  });

  return result
    ? {
        stripeSecretKey: result.stripeSecretKey,
        stripeWebhookSecret: result.stripeWebhookSecret,
      }
    : null;
}
