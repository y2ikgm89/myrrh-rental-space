import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * イベント繰り上げ当選（waitlist offer）確認用トークン。
 *
 * 設計は `event-registration-cancel-token.ts` と同型（`crypto.ts` の認証付き暗号
 * AES-256-GCM + HKDF、purpose bound 導出鍵）だが、**`exp`/`iat` claim は
 * 埋め込まない**。繰り上げ当選の有効期限（24h TTL）は
 * `EventRegistration.expiresAt` が唯一の正本であり、`confirmWaitlistOfferCommand`
 * が確定処理の中で DB 行を読み直して判定する（token 側に独立した exp を
 * 持たせると、将来 admin が offer window を延長する等の運用変更時に token と
 * DB の期限が乖離しうる）。token は「この registrationId を指している」ことだけを
 * 保証するステートレスな識別子として扱う。
 *
 * - 改ざんは GCM の authTag で検知（→ null）
 * - purpose 不一致（他トークン種別の誤用、例: 予約キャンセルトークンの流用）も
 *   `decrypt()` が throw する（→ null）。cross-token misuse 防止
 *   （memory: [[project_dup1-token-followup-alternative-c-2026-07-11]]）
 * - 暗号文は URL 安全な base64url で包む（`/events/waitlist/confirm?token=...`
 *   クエリ値・`/events/waitlist/checkout/[token]` パスセグメントの両方で
 *   使われるため、標準 base64 の `+` `/` `=` は不可）
 */

const PURPOSE = "event-waitlist-offer";

export function createWaitlistOfferToken(payload: {
  registrationId: string;
}): string {
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyWaitlistOfferToken(
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
