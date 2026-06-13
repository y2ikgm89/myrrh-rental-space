import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";

/**
 * ゲスト予約キャンセル用トークン
 *
 * 会員でない予約者が確認メールのリンクからログインなしでキャンセルできるよう、
 * 予約ID と有効期限を `crypto.ts` の認証付き暗号（AES-256-GCM + HKDF）で封入する。
 * トークン自体が本人性を担保するため、DB へのトークン保存は不要（ステートレス）。
 *
 * - 改ざんは GCM の authTag で検知（→ invalid）
 * - 有効期限切れは `exp` で検知（→ expired）
 * - 暗号文は URL 安全な base64url で包む
 */

const PURPOSE = "reservation-cancel";

interface CancelTokenPayload {
  /** 予約ID（UUID） */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyCancelTokenResult =
  | { valid: true; reservationId: string }
  | { valid: false; reason: "invalid" | "expired" };

/**
 * キャンセルトークンを生成する。
 *
 * @param reservationId 予約ID
 * @param expiresAt 有効期限（この時刻を過ぎると expired）
 */
export function createCancelToken(
  reservationId: string,
  expiresAt: Date,
): string {
  const payload: CancelTokenPayload = {
    rid: reservationId,
    exp: expiresAt.getTime(),
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * キャンセルトークンを検証する。
 *
 * @param token URL から受け取ったトークン
 * @param now 現在時刻（呼び出し側が `reservationDeadlineNow()` を渡す）
 */
export function verifyCancelToken(
  token: string,
  now: Date,
): VerifyCancelTokenResult {
  const ciphertext = Buffer.from(token, "base64url").toString("utf8");

  // purpose を明示検証（予約完了トークン等の他用途トークンの流用を拒否）
  if (ciphertext.split(":")[1] !== PURPOSE) {
    return { valid: false, reason: "invalid" };
  }

  let raw: string;
  try {
    raw = decrypt(ciphertext);
  } catch {
    return { valid: false, reason: "invalid" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { valid: false, reason: "invalid" };
  }

  if (!isCancelTokenPayload(payload)) {
    return { valid: false, reason: "invalid" };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, reservationId: payload.rid };
}

function isCancelTokenPayload(value: unknown): value is CancelTokenPayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record["rid"] === "string" && typeof record["exp"] === "number";
}
