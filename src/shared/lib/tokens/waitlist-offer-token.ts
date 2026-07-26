import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * イベント繰り上げ当選（waitlist offer）確認用トークン。
 *
 * 設計は `event-registration-cancel-token.ts` と同型（`crypto.ts` の認証付き暗号
 * AES-256-GCM + HKDF、purpose bound 導出鍵）。`exp` claim は
 * `EventRegistration.expiresAt`（offer window）に揃えて埋め込む。
 *
 * DB の `expiresAt` が業務上の正本であり、`confirmWaitlistOfferCommand` /
 * `createWaitlistOfferCheckoutSessionCommand` が確定・checkout 入口で再検証する。
 * token `exp` は defense-in-depth（URL/メール漏洩後の再利用窓を offer window に
 * 上限する）。admin が offer window を延長しても既存 token は延長されない
 * （再送で新 token を発行する運用）。
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
  /** offer window 終了時刻（`EventRegistration.expiresAt`） */
  expiresAt: Date;
}): string {
  const ciphertext = encrypt(
    JSON.stringify({
      registrationId: payload.registrationId,
      exp: payload.expiresAt.getTime(),
    }),
    { purpose: PURPOSE },
  );
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyWaitlistOfferToken(
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
