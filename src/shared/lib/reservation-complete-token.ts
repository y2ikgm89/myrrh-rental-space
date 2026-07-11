import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * 予約完了ページ用トークン
 *
 * 予約直後のリダイレクト先（完了ページ）で、会員・ゲストを問わず予約を安全に特定するために
 * 予約ID と有効期限を認証付き暗号（AES-256-GCM + HKDF）で封入する。トークン自体が表示権限を
 * 担保するため DB 保存は不要（ステートレス）。生 ID を URL に出さないことで列挙による他人の
 * 予約サマリー（氏名等の PII を含む）閲覧を防ぐ。
 *
 * キャンセルトークン（reservation-cancel-token）とは `purpose` を分け、verify 側で purpose を
 * 明示検証する。完了 URL は閲覧履歴・アクセス解析等で漏れやすいため、万一漏れてもキャンセル
 * 操作には流用できないようにする狙い。
 */

const PURPOSE = "reservation-complete";

interface CompleteTokenPayload {
  /** 予約ID（UUID） */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyCompleteTokenResult =
  { valid: true; reservationId: string } | { valid: false };

/**
 * 完了トークンを生成する。
 *
 * @param reservationId 予約ID
 * @param expiresAt 有効期限（この時刻を過ぎると無効）
 */
export function createCompleteToken(
  reservationId: string,
  expiresAt: Date,
): string {
  const payload: CompleteTokenPayload = {
    rid: reservationId,
    exp: expiresAt.getTime(),
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * 完了トークンを検証する。
 *
 * 期限切れ・改ざん・他用途（キャンセル等）のトークンはすべて `{ valid: false }` として扱う。
 * 完了ページは無効時に汎用の受付完了メッセージへフォールバックするため、理由の区別は不要。
 *
 * @param token URL から受け取ったトークン
 * @param now 現在時刻
 */
export function verifyCompleteToken(
  token: string,
  now: Date,
): VerifyCompleteTokenResult {
  const ciphertext = Buffer.from(token, "base64url").toString("utf8");

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

  if (!isCompleteTokenPayload(payload)) {
    return { valid: false };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false };
  }

  return { valid: true, reservationId: payload.rid };
}

function isCompleteTokenPayload(value: unknown): value is CompleteTokenPayload {
  if (!isRecord(value)) return false;
  return typeof value["rid"] === "string" && typeof value["exp"] === "number";
}
