/**
 * 送信元ドメインの Resend 検証状態チェック
 *
 * 管理画面で送信元アドレス（senderEmail）を保存する際、そのドメインが Resend で
 * 送信可能（検証済み）かを確認する。未検証ドメインを from に使うと全送信が 403 に
 * なるため、保存時点で弾いて事故を防ぐ。
 *
 * @module shared/lib/email/domain-verification
 */
import "server-only";

import type { EmailTransportContext } from "./types";
import { getResendClientForApiKey } from "./client";

/** Resend で送信可能とみなすドメインステータス（DKIM 検証済みで送信できる状態）。 */
const SENDABLE_STATUSES: ReadonlySet<string> = new Set([
  "verified",
  "partially_verified",
]);

export type SenderDomainCheck =
  | { ok: true }
  | {
      ok: false;
      verifiedDomains: string[];
      reason: "domain_unverified" | "resend_unavailable" | "resend_error";
    };

/**
 * 送信元アドレスのドメインが Resend で送信可能かを確認する。
 *
 * transport は呼び出し側（domain / admin action）が prefetch する。
 */
export async function validateSenderDomain(
  senderEmail: string,
  transport: EmailTransportContext,
): Promise<SenderDomainCheck> {
  const domain = senderEmail.split("@")[1]?.toLowerCase();
  if (!domain) return { ok: true };

  const apiKey = transport.resendApiKey;
  if (!apiKey) {
    return { ok: false, verifiedDomains: [], reason: "resend_unavailable" };
  }

  const resend = getResendClientForApiKey(apiKey);

  try {
    const { data, error } = await resend.domains.list();
    if (error || !data) {
      return { ok: false, verifiedDomains: [], reason: "resend_error" };
    }

    const sendable = data.data
      .filter((d) => SENDABLE_STATUSES.has(d.status))
      .map((d) => d.name.toLowerCase());

    if (sendable.includes(domain)) return { ok: true };
    return {
      ok: false,
      verifiedDomains: sendable,
      reason: "domain_unverified",
    };
  } catch {
    return { ok: false, verifiedDomains: [], reason: "resend_error" };
  }
}
