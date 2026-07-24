import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { getAppUrl } from "@/shared/lib/constants";
import { isRecord } from "@/shared/lib/serialize";

/**
 * マーケ一斉配信の List-Unsubscribe / 本文リンク用トークン。
 *
 * waitlist / event-registration-payment と同型の purpose-bound AES-256-GCM。
 * payload に `customerId` と `exp`（絶対時刻 ms）を載せ、検証時に期限切れを弾く。
 *
 * @see https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
 * @see https://www.rfc-editor.org/rfc/rfc8058
 */

const PURPOSE = "marketing-unsubscribe";

/** トークン有効期限（90 日）。再配信時に新しいトークンが発行される。 */
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export function createMarketingUnsubscribeToken(customerId: string): string {
  const payload = {
    customerId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyMarketingUnsubscribeToken(
  token: string,
): { customerId: string } | null {
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
  if (typeof parsed["customerId"] !== "string") return null;
  if (typeof parsed["exp"] !== "number") return null;
  if (parsed["exp"] <= Date.now()) return null;

  return { customerId: parsed["customerId"] };
}

/** RFC 8058: HTTPS URL（同一 URL で GET / POST）。 */
export function buildMarketingUnsubscribeUrl(customerId: string): string {
  const token = createMarketingUnsubscribeToken(customerId);
  const url = new URL("/api/email/unsubscribe", getAppUrl());
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * 本文リンクと List-Unsubscribe ヘッダで **同一トークン** を共有する。
 * URL 生成を2回呼ぶとトークンが別物になり one-click と本文が乖離するため、
 * ここを SSoT にする。
 */
export function createMarketingUnsubscribeArtifacts(customerId: string): {
  url: string;
  headers: Record<string, string>;
} {
  const url = buildMarketingUnsubscribeUrl(customerId);
  return {
    url,
    headers: {
      "List-Unsubscribe": `<${url}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
