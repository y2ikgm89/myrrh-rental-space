import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import {
  getStripeCredentialCiphertext,
  getStripeSettings,
} from "@/shared/domain/settings/queries/integration";
import { serverEnv } from "@/shared/lib/env/server";
import { isFeatureEnabled } from "@/shared/domain/features/check";

/**
 * オンライン決済（Stripe）の gate を「業務判断」と「技術状態」で分離する
 * ドメイン層 SSoT。
 *
 * ## 二層分離（Shopify shop.features / Stripe Capabilities 相当）
 *
 * - **業務層** — `isFeatureEnabled("payment")`: 運営者が「オンライン決済機能を提供する」と
 *   宣言しているか。`SettingsFeatures.featureModules.payment` が SSoT。`requires: ["reservation"]`
 *   のため reservation OFF で自動 OFF される（feature module registry の cascade）。
 * - **技術層** — Stripe credentials: `stripeSecretKey` と `stripeWebhookSecret` の
 *   両方が保存されているか。webhook 経由の状態遷移・既存決済の返金・pending checkout
 *   expire 等に必須。
 *
 * ## 関数の使い分け
 *
 * - `assertOnlinePaymentAvailable()` — **新規 checkout session 作成**のみ
 *   (予約 / イベント payment-commands の create 経路)。feature OFF または credentials 欠損で throw。
 * - `assertStripeCredentialsConfigured()` — **既存決済の settlement**
 *   (Stripe webhook、返金コマンド、pending checkout expire、領収書 backfill cron 等)。
 *   feature OFF でも credentials があれば成功。credentials 欠損で throw。
 *
 * UI 側の「決済ボタンを出すか」判定は `isOnlinePaymentAvailable()` を使う
 * (feature ON **かつ** credentials 設定済みの両方)。credentials 欠損時にボタンだけ
 * 出して Server Action / Route が必ず失敗する UX を避ける (product clean-break)。
 *
 * 公開ページの決済に関する**説明文**も同じ `isOnlinePaymentAvailable()` で、
 * 両方を満たす場合に「オンライン決済に対応」等の copy を出す。
 */
export interface StripeCredentials {
  readonly stripeSecretKey: string | null;
  readonly stripeWebhookSecret: string;
  readonly stripePublishableKey: string | null;
  readonly stripeAccountId: string | null;
  readonly stripeCurrency: string;
  readonly stripePaymentMethodTypes: readonly string[];
}

async function loadStripeCredentials(): Promise<StripeCredentials> {
  const [publicSettings, credentials] = await Promise.all([
    getStripeSettings(),
    getStripeCredentialCiphertext(),
  ]);

  const hasSecretKey = Boolean(
    credentials?.stripeSecretKey || serverEnv.STRIPE_SECRET_KEY,
  );
  const webhookCiphertext = credentials?.stripeWebhookSecret;
  if (!hasSecretKey || !webhookCiphertext) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  return {
    stripeSecretKey: credentials?.stripeSecretKey ?? null,
    stripeWebhookSecret: webhookCiphertext,
    stripePublishableKey: publicSettings?.stripePublishableKey ?? null,
    stripeAccountId: publicSettings?.stripeAccountId ?? null,
    stripeCurrency: publicSettings?.stripeCurrency ?? "jpy",
    stripePaymentMethodTypes: publicSettings?.stripePaymentMethodTypes ?? [
      "card",
    ],
  };
}

/**
 * Stripe credentials のみ検証する。feature module OFF でも credentials があれば成功。
 * webhook / 返金 / pending expire / receipt backfill 等、既存決済の settlement 用。
 */
export async function assertStripeCredentialsConfigured(): Promise<StripeCredentials> {
  return loadStripeCredentials();
}

/**
 * 新規 checkout 用 gate。feature module ON かつ credentials 設定済みであること。
 */
export async function assertOnlinePaymentAvailable(): Promise<StripeCredentials> {
  if (!(await isFeatureEnabled("payment"))) {
    throw new DomainError(
      "オンライン決済機能が無効になっています",
      "VALIDATION",
    );
  }

  return loadStripeCredentials();
}

/**
 * 公開 UI の checkout ボタン表示・決済説明 copy 用。
 * feature ON かつ Stripe credentials 設定済みのとき true。
 */
export async function isOnlinePaymentAvailable(): Promise<boolean> {
  if (!(await isFeatureEnabled("payment"))) {
    return false;
  }

  try {
    await loadStripeCredentials();
    return true;
  } catch {
    return false;
  }
}
