import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import { getConnectionHealth } from "@/shared/domain/settings/connection-health";
import { IntegrationKey } from "@/shared/lib/validations/enums/prisma-types";

/**
 * Stripe の公開設定（publishable key / 通貨 / 接続状態など）を返す。
 *
 * **`"use cache"` に載せない。** admin と public は別の Cloud Run サービスで、
 * 既定キャッシュハンドラはプロセス内メモリなので admin の `updateTag` は
 * public の Data Cache に届かない（共有 cacheHandler は未配線）。この値は
 * `loadStripeCredentials` 経由で checkout の `payment_method_types` と
 * `currency` を決める**判断値**で、表示用ではない。長寿命キャッシュに載せると
 * 管理画面で通貨や決済手段を変えても public は最大 24 時間（`STATIC_SETTINGS`）
 * 旧値で checkout を作り続ける。
 *
 * 同じ理由で `getStripeCredentialCiphertext` も非キャッシュ。料金プラン
 * （#2509）・税率スナップショット・返金ポリシーも同じ判断で非キャッシュにしてある。
 */
export async function getStripeSettings() {
  const [result, health] = await Promise.all([
    safeFetch({
      fetch: () =>
        prisma.settingsStripe.findUnique({
          where: { id: "singleton" },
          select: {
            stripePublishableKey: true,
            stripeAccountId: true,
            stripeCurrency: true,
            stripePaymentMethodTypes: true,
          },
        }),
      fallback: null,
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getStripeSettings",
    }),
    getConnectionHealth(IntegrationKey.STRIPE),
  ]);

  return toPlainObject(
    result
      ? {
          ...result,
          stripeLastTestedAt: health.lastCheckedAt,
          stripeConnectionStatus: health.status,
        }
      : null,
  );
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
