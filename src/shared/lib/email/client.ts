import "server-only";
import { Resend } from "resend";
import { SITE_DEFAULTS } from "../constants";
import { serverEnv } from "@/shared/lib/env/server";
import { getDecryptedResendApiKey } from "@/shared/domain/settings/api-key-queries";

/**
 * 有効な Resend API キーを解決する（DB 優先・管理画面で未設定なら env フォールバック）。
 *
 * Stripe (`getStripeClient`) / Turnstile (`getDecryptedTurnstileSecretKey`) と同じ
 * DB-OR-env パターン（Settings is canonical、`.claude/rules/integrations.md`参照）。
 * DB キーがある場合は env を読まずに短絡する。
 */
async function resolveResendApiKey(): Promise<string | null> {
  return (await getDecryptedResendApiKey()) ?? serverEnv.RESEND_API_KEY ?? null;
}

/**
 * Check if email functionality is enabled (env または DB のいずれかにキーがある)。
 */
export async function isEmailEnabled(): Promise<boolean> {
  return (await resolveResendApiKey()) !== null;
}

/**
 * Get Resend client instance.
 * Returns null if no API key is configured (env / DB のどちらにも無い場合)。
 *
 * 解決済みキー値でキャッシュする。管理画面でキーをローテーションした際に stale な
 * クライアントを返さないよう、キー値が変わったら再生成する。
 */
let cachedClient: { key: string; client: Resend } | null = null;

export async function getResendClient(): Promise<Resend | null> {
  const apiKey = await resolveResendApiKey();
  if (!apiKey) return null;

  if (!cachedClient || cachedClient.key !== apiKey) {
    cachedClient = { key: apiKey, client: new Resend(apiKey) };
  }

  return cachedClient.client;
}

/**
 * 送信元アドレスを `表示名 <アドレス>` 形式で組み立てる。
 *
 * 解決順は env 優先・DB フォールバック:
 *   アドレス: env EMAIL_FROM → DB senderEmail → "noreply@example.com"
 *   表示名:   env EMAIL_FROM_NAME → DB senderName → SITE_DEFAULTS.name
 *
 * 注: これは表示用の送信元アドレスであり、Stripe/Turnstile/Resendの秘密APIキー解決順
 * （DB優先、`.claude/rules/integrations.md`参照）とは独立した設定。漏洩時の影響や
 * ローテーション性の懸念がないため env 優先のままで問題ない。
 *
 * DB 値（管理画面のメール設定）は呼び出し側が `getEmailDeliverySettings()` から
 * 取得して渡す（client 層から domain クエリへ往復させない）。
 */
export function getFromAddress(
  senderEmail: string | null,
  senderName: string | null,
): string {
  const email = serverEnv.EMAIL_FROM ?? senderEmail ?? "noreply@example.com";
  const name = serverEnv.EMAIL_FROM_NAME ?? senderName ?? SITE_DEFAULTS.name;
  return `${name} <${email}>`;
}
