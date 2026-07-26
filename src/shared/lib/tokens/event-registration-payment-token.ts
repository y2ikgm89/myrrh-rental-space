import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { getAppUrl } from "@/shared/lib/constants";
import { MS_PER_DAY } from "@/shared/lib/date-format";
import { isRecord } from "@/shared/lib/serialize";

/**
 * 有料イベント直接申込の Stripe Checkout 起動用トークン。
 *
 * waitlist offer token と同型（purpose-bound AES-256-GCM）。ゲスト申込
 * (customerId=null) はマイページ checkout が使えないため、確認メール経由の
 * token 認可 route (`/events/registrations/checkout?token=…`) で決済を開始する。
 *
 * `proxy.ts` が `?token=` を HttpOnly cookie に転写して URL から除去し、
 * Route Handler は cookie のみを読む（予約 status / claim と同パターン）。
 *
 * payload に `exp`（発行から {@link EVENT_REGISTRATION_PAYMENT_TOKEN_TTL_MS}）を
 * 載せ、期限切れトークンは verify で拒否する。
 */
const PURPOSE = "event-registration-payment";

/** 決済リンクの漏洩窓上限（7 日）。再送時に新しいトークンが発行される。 */
export const EVENT_REGISTRATION_PAYMENT_TOKEN_TTL_MS = 7 * MS_PER_DAY;

export function createEventRegistrationPaymentToken(payload: {
  registrationId: string;
  now?: Date;
}): string {
  const issuedAt = payload.now ?? new Date();
  const ciphertext = encrypt(
    JSON.stringify({
      registrationId: payload.registrationId,
      exp: issuedAt.getTime() + EVENT_REGISTRATION_PAYMENT_TOKEN_TTL_MS,
    }),
    { purpose: PURPOSE },
  );
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyEventRegistrationPaymentToken(
  token: string,
  now: Date = new Date(),
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
  if (typeof parsed["exp"] !== "number" || !Number.isFinite(parsed["exp"])) {
    return null;
  }
  if (parsed["exp"] <= now.getTime()) return null;

  return { registrationId: parsed["registrationId"] };
}

export function buildEventRegistrationPaymentCheckoutUrl(
  registrationId: string,
): string {
  const token = createEventRegistrationPaymentToken({ registrationId });
  return `${getAppUrl()}/events/registrations/checkout?token=${token}`;
}
