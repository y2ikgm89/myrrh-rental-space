import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { MS_PER_DAY } from "@/shared/lib/date-format";
import { isRecord } from "@/shared/lib/serialize";

/**
 * ゲスト予約ステータス（薄い詳細）ページ用トークン
 *
 * 会員でない予約者がメールのリンクからログインなしで予約サマリ・領収書 DL 導線を
 * 開けるよう、予約ID と有効期限を認証付き暗号（AES-256-GCM + HKDF）で封入する。
 * トークン自体が表示権限を担保するため DB 保存は不要（ステートレス）。生 ID を
 * URL に出さないことで列挙による他人の予約サマリー閲覧を防ぐ。
 *
 * 完了・キャンセル・claim トークンとは `purpose` を分け、verify 側で purpose を
 * 明示検証する。ステータス URL はメール経由で長期間残りやすいため、万一漏れても
 * キャンセル操作や完了ページ用トークンには流用できないようにする狙い。
 */

const PURPOSE = "reservation-status";

/**
 * ステータストークンの推奨有効期間（発行時点から）。
 *
 * 利用終了後も領収書ダウンロードできるよう、mint 時刻から **90 日**。
 * 呼び出し側は `expiresAt = new Date(Date.now() + STATUS_TOKEN_LIFETIME_MS)`
 * （または同等）で mint すること。トークン本体は rid+exp のみ保持する。
 */
export const STATUS_TOKEN_LIFETIME_MS = 90 * MS_PER_DAY;

interface StatusTokenPayload {
  /** 予約ID（UUID） */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyStatusTokenResult =
  { valid: true; reservationId: string } | { valid: false };

/**
 * ステータストークンを生成する。
 *
 * @param reservationId 予約ID
 * @param expiresAt 有効期限（この時刻を過ぎると無効）。通常は mint から
 *   {@link STATUS_TOKEN_LIFETIME_MS}（90 日）後を渡す
 */
export function createStatusToken(
  reservationId: string,
  expiresAt: Date,
): string {
  const payload: StatusTokenPayload = {
    rid: reservationId,
    exp: expiresAt.getTime(),
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * ステータストークンを検証する。
 *
 * 期限切れ・改ざん・他用途（完了・キャンセル・claim 等）のトークンはすべて
 * `{ valid: false }` として扱う。ステータスページは無効時に汎用エラーへ
 * フォールバックするため、理由の区別は不要。
 *
 * @param token URL / cookie から受け取ったトークン
 * @param now 現在時刻
 */
export function verifyStatusToken(
  token: string,
  now: Date,
): VerifyStatusTokenResult {
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

  if (!isStatusTokenPayload(payload)) {
    return { valid: false };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false };
  }

  return { valid: true, reservationId: payload.rid };
}

function isStatusTokenPayload(value: unknown): value is StatusTokenPayload {
  if (!isRecord(value)) return false;
  return typeof value["rid"] === "string" && typeof value["exp"] === "number";
}
