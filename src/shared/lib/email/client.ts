import "server-only";
import { Resend } from "resend";
import { SITE_DEFAULTS } from "../constants";
import { serverEnv } from "@/shared/lib/env/server";
import type { EmailTransportContext } from "./types";

/**
 * DB 復号済みキーと env をマージして有効な Resend API キーを返す。
 * domain が DB から取得した値を渡す（lib から domain query は呼ばない）。
 */
export function resolveTransportApiKey(
  dbApiKey: string | null | undefined,
): string | null {
  return dbApiKey ?? serverEnv.RESEND_API_KEY ?? null;
}

/** transport DTO からメール送信が有効か判定する。 */
export function isEmailTransportEnabled(
  transport: EmailTransportContext,
): boolean {
  return transport.resendApiKey !== null;
}

/**
 * 解決済み API キーで Resend client を返す。キー値でキャッシュし、
 * ローテーション後に stale client を返さない。
 */
let cachedClient: { key: string; client: Resend } | null = null;

export function getResendClientForApiKey(apiKey: string): Resend {
  if (!cachedClient || cachedClient.key !== apiKey) {
    cachedClient = { key: apiKey, client: new Resend(apiKey) };
  }
  return cachedClient.client;
}

/**
 * 送信元アドレスの解決順（env 優先・DB フォールバック）だけを返す:
 *   env EMAIL_FROM → DB senderEmail → throw
 *
 * `getFromAddress` と、送信前にドメイン検証したい呼び出し側
 * （settings 保存 / テンプレートテスト送信）とで解決ロジックを共有するために切り出した。
 */
export function resolveSenderEmailAddress(senderEmail: string | null): string {
  const resolved = serverEnv.EMAIL_FROM ?? senderEmail;
  if (!resolved) {
    throw new Error(
      "Email sender address is not configured. Set env EMAIL_FROM " +
        "or configure Settings.senderEmail in /admin/settings/integrations. " +
        "The address must belong to a Resend-verified domain.",
    );
  }
  return resolved;
}

/**
 * 送信元アドレスを `表示名 <アドレス>` 形式で組み立てる。
 *
 * 解決順は env 優先・DB フォールバック:
 *   アドレス: resolveSenderEmailAddress() 参照
 *   表示名:   env EMAIL_FROM_NAME → DB senderName → SITE_DEFAULTS.name
 */
export function getFromAddress(
  senderEmail: string | null,
  senderName: string | null,
): string {
  const email = resolveSenderEmailAddress(senderEmail);
  const name = serverEnv.EMAIL_FROM_NAME ?? senderName ?? SITE_DEFAULTS.name;
  return `${name} <${email}>`;
}
