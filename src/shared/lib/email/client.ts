import "server-only";
import { Resend } from "resend";
import { SITE_DEFAULTS } from "../constants";
import { serverEnv } from "@/shared/lib/env/server";
import { getDecryptedResendApiKey } from "@/shared/domain/settings/api-key-queries";

export const EMAIL_FROM = serverEnv.EMAIL_FROM ?? "noreply@example.com";
export const EMAIL_FROM_NAME = serverEnv.EMAIL_FROM_NAME ?? SITE_DEFAULTS.name;

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
 * Get formatted from address
 */
export function getFromAddress(): string {
  return `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`;
}
