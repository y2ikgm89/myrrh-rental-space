import "server-only";
import { Resend } from "resend";
import { SITE_DEFAULTS } from "../constants";
import { serverEnv } from "@/shared/lib/env/server";
import { getDecryptedResendApiKey } from "@/shared/domain/settings/api-key-queries";

/**
 * 有効な Resend API キーを解決する（env 優先・無ければ管理画面で設定された DB キー）。
 *
 * Stripe (`getStripeClient`) / Turnstile (`getDecryptedTurnstileSecretKey`) と同じ
 * env-OR-DB パターン。これが無いと送信経路は env のみを見るため、管理画面で設定した
 * 暗号化キー（settings.resendApiKey）が使われず、本番で全メールが silent no-op になる。
 * env キーがある場合は DB を読まずに短絡する（本番の通常経路では DB アクセスを増やさない）。
 */
async function resolveResendApiKey(): Promise<string | null> {
  return serverEnv.RESEND_API_KEY ?? (await getDecryptedResendApiKey());
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
 * 解決順は env 優先・DB フォールバック（Stripe / Turnstile / Resend APIキーと同じ
 * env-OR-DB パターン）:
 *   アドレス: env EMAIL_FROM → DB senderEmail → "noreply@example.com"
 *   表示名:   env EMAIL_FROM_NAME → DB senderName → SITE_DEFAULTS.name
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
