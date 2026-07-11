import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * イベント参加申込 claim トークン。設計は `reservation-claim-token.ts` と同一
 * （purpose のみ分離）。詳細なコメントはそちらを参照。
 */

const PURPOSE = "event-registration-claim";

export const MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS =
  7 * 24 * 60 * 60 * 1000;

interface ClaimTokenPayload {
  /** イベント参加申込ID（UUID） */
  eid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyEventRegistrationClaimTokenResult =
  { valid: true; eventRegistrationId: string } | { valid: false };

export function createEventRegistrationClaimToken(
  eventRegistrationId: string,
  issuedAt: Date = new Date(),
): string {
  const payload: ClaimTokenPayload = {
    eid: eventRegistrationId,
    exp: issuedAt.getTime() + MAX_EVENT_REGISTRATION_CLAIM_TOKEN_LIFETIME_MS,
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyEventRegistrationClaimToken(
  token: string,
  now: Date,
): VerifyEventRegistrationClaimTokenResult {
  let ciphertext: string;
  try {
    ciphertext = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { valid: false };
  }

  let raw: string;
  try {
    raw = decrypt(ciphertext, { expectedPurpose: PURPOSE }).toString("utf8");
  } catch {
    return { valid: false };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { valid: false };
  }

  if (!isClaimTokenPayload(payload)) {
    return { valid: false };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false };
  }

  return { valid: true, eventRegistrationId: payload.eid };
}

function isClaimTokenPayload(value: unknown): value is ClaimTokenPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value["eid"] === "string" &&
    typeof value["exp"] === "number" &&
    Number.isFinite(value["exp"])
  );
}
