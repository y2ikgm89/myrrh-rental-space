import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { getAppUrl } from "@/shared/lib/constants";
import { isRecord } from "@/shared/lib/serialize";

/**
 * 有料イベント直接申込の Stripe Checkout 起動用トークン。
 *
 * waitlist offer token と同型（purpose-bound AES-256-GCM）。ゲスト申込
 * (customerId=null) はマイページ checkout が使えないため、確認メール経由の
 * token 認可 route (`/events/registrations/checkout/[token]`) で決済を開始する。
 */
const PURPOSE = "event-registration-payment";

export function createEventRegistrationPaymentToken(payload: {
  registrationId: string;
}): string {
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyEventRegistrationPaymentToken(
  token: string,
): { registrationId: string } | null {
  let ciphertext: string;
  try {
    ciphertext = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }

  let raw: string;
  try {
    raw = decrypt(ciphertext, { expectedPurpose: PURPOSE }).toString("utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (typeof parsed["registrationId"] !== "string") return null;
  return { registrationId: parsed["registrationId"] };
}

export function buildEventRegistrationPaymentCheckoutUrl(
  registrationId: string,
): string {
  const token = createEventRegistrationPaymentToken({ registrationId });
  return `${getAppUrl()}/events/registrations/checkout/${token}`;
}
