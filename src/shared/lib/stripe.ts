/**
 * Stripe 初期化・ヘルパー関数
 *
 * DB優先（管理画面設定）、envはフォールバック
 * テストモード自動検出
 * 接続テスト機能
 *
 * @important server-only — Client Component から import 禁止
 */

import "server-only";
import Stripe from "stripe";
import { safeDecrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { serverEnv } from "@/shared/lib/env/server";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { isValidSecretKey, isTestKey } from "./stripe-shared";

/**
 * Stripe webhook helpers の async-only 型封印
 *
 * Bun runtime（Web Crypto / SubtleCryptoProvider 経路）では sync 版の
 * `constructEvent` / `generateTestHeaderString` が `Error: Stripe is unable to
 * perform synchronous crypto operations in this environment.` を投げる。
 * stripe-node 公式が edge runtime 向けに `constructEventAsync` /
 * `generateTestHeaderStringAsync` を提供しているため、Bun 上では async 版のみ
 * 使う。型レベルで sync 版を削除し、誤って呼ばれた瞬間に TS エラーとして
 * 検出する。互換 ESLint rule (`no-restricted-syntax`) で直接呼出も禁止し、
 * 型 + lint の 2 段防御とする。
 *
 * @see https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts
 * @see https://github.com/stripe/stripe-node/blob/master/testProjects/cloudflare-pages/functions/index.js
 */
type SyncOnlyWebhookMembers = "constructEvent" | "generateTestHeaderString";
type AsyncOnlyWebhooks = Omit<Stripe["webhooks"], SyncOnlyWebhookMembers>;

/**
 * アプリケーションで使う Stripe service 面だけを公開する facade。
 * `webhooks` は async-only 型にして、Bun で失敗する sync crypto 経路を
 * 型レベルで到達不能にする。
 */
export interface AsyncOnlyStripe {
  readonly accounts: Stripe["accounts"];
  readonly checkout: Stripe["checkout"];
  readonly refunds: Stripe["refunds"];
  readonly webhooks: AsyncOnlyWebhooks;
}

/**
 * Stripe設定の取得元
 */
export type StripeConfigSource = "env" | "db" | null;

/**
 * Stripe接続テスト結果
 */
export interface StripeConnectionTestResult {
  success: boolean;
  error?: string;
  accountId?: string;
  mode?: "test" | "live";
  source?: StripeConfigSource;
}

/**
 * 環境変数からStripeシークレットキーを取得
 */
function getEnvSecretKey(): string | null {
  return serverEnv.STRIPE_SECRET_KEY ?? null;
}

/**
 * Stripeクライアントを作成
 *
 * 戻り値は `AsyncOnlyStripe` facade で sync webhook helpers を型レベルで封印する。
 *
 * @param secretKey - シークレットキー（復号化済み）
 */
export function createStripeClient(secretKey: string): AsyncOnlyStripe {
  const client = new Stripe(secretKey, {
    // stripe@22 ピン留め — SDK 更新時は型エラーで次の LatestApiVersion が分かる
    apiVersion: "2026-06-24.dahlia",
    typescript: true,
  });
  return {
    accounts: client.accounts,
    checkout: client.checkout,
    refunds: client.refunds,
    webhooks: client.webhooks,
  };
}

/**
 * DB設定（管理画面）を優先し、なければ環境変数からStripeクライアントを取得
 * （Settings is canonical、`.claude/rules/integrations.md`参照）
 * @param dbSecretKey - DBから取得した暗号化されたシークレットキー
 * @returns Stripeクライアントと設定元
 */
export async function getStripeClient(dbSecretKey?: string | null): Promise<{
  client: AsyncOnlyStripe | null;
  source: StripeConfigSource;
}> {
  if (dbSecretKey) {
    const decryptedKey =
      safeDecrypt(dbSecretKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
      })?.toString("utf8") ?? null;
    if (decryptedKey) {
      return { client: createStripeClient(decryptedKey), source: "db" };
    }
  }

  const envKey = getEnvSecretKey();
  if (envKey) {
    return { client: createStripeClient(envKey), source: "env" };
  }

  return { client: null, source: null };
}

/**
 * Stripe接続テスト
 * @param secretKey - テストするシークレットキー（平文）
 */
export async function testStripeConnection(
  secretKey: string,
): Promise<StripeConnectionTestResult> {
  try {
    if (!isValidSecretKey(secretKey)) {
      return {
        success: false,
        error:
          "シークレットキーの形式が正しくありません。sk_test_ または sk_live_ で始まる必要があります。",
      };
    }

    const stripe = createStripeClient(secretKey);
    const account = await stripe.accounts.retrieve(null);

    return {
      success: true,
      accountId: account.id,
      mode: isTestKey(secretKey) ? "test" : "live",
    };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return {
        success: false,
        error: "APIキーが無効です。正しいキーを入力してください。",
      };
    }

    if (error instanceof Stripe.errors.StripePermissionError) {
      return {
        success: false,
        error: "このAPIキーにはアカウント情報へのアクセス権限がありません。",
      };
    }

    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "testStripeConnection" },
    });
    return {
      success: false,
      error:
        "Stripe接続テストに失敗しました。詳細はサーバーログを確認してください。",
    };
  }
}
