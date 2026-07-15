import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * Receipt (領収書) ダウンロードトークン。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#4。
 * 適格請求書 PDF のダウンロード経路 2 種のうち、**署名 URL 経路**用のトークン発行/検証。
 *
 * ## 経路 1: Better Auth session
 * 認証済み顧客が mypage から DL する場合、Route Handler が Better Auth session の
 * customer.id と Receipt.reservation.customerId / eventRegistration.customerId を突合する。
 * トークン不要。
 *
 * ## 経路 2: 署名 URL (本トークン)
 * ゲスト予約 (customerId=null) からメール本文リンク経由で DL する場合、
 * Better Auth session が存在しないため署名トークン検証で ownership を担保する。
 * メールから発行 → 60 分有効。
 *
 * ## 設計
 * `event-registration-claim-token.ts` と同型 (crypto.ts の encrypt/decrypt + purpose 分離
 * + payload の exp)。purpose を "receipt-download" として分離することで、トークン漏洩時に
 * 他 purpose (claim / cancel) の悪用を封じる。
 */

const PURPOSE = "receipt-download";

export const MAX_RECEIPT_DOWNLOAD_TOKEN_LIFETIME_MS = 60 * 60 * 1000; // 60 分

interface DownloadTokenPayload {
  /** Receipt.serialNo (「YYYY-XXXXXX」形式) */
  sn: string;
  /** 有効期限 (ms epoch) */
  exp: number;
}

export type VerifyReceiptDownloadTokenResult =
  { valid: true; serialNo: string } | { valid: false };

export function createReceiptDownloadToken(
  serialNo: string,
  issuedAt: Date = new Date(),
): string {
  const payload: DownloadTokenPayload = {
    sn: serialNo,
    exp: issuedAt.getTime() + MAX_RECEIPT_DOWNLOAD_TOKEN_LIFETIME_MS,
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

export function verifyReceiptDownloadToken(
  token: string,
  now: Date,
): VerifyReceiptDownloadTokenResult {
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

  if (!isDownloadTokenPayload(payload)) {
    return { valid: false };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false };
  }

  return { valid: true, serialNo: payload.sn };
}

function isDownloadTokenPayload(value: unknown): value is DownloadTokenPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value["sn"] === "string" &&
    typeof value["exp"] === "number" &&
    Number.isFinite(value["exp"])
  );
}
