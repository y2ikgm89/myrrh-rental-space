import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { MS_PER_DAY } from "@/shared/lib/date-format";
import { isRecord } from "@/shared/lib/serialize";

/**
 * ゲストイベント参加申込ステータス（薄い詳細）ページ用トークン
 *
 * 会員でない参加者がメールのリンクからログインなしで申込サマリ・領収書 DL 導線を
 * 開けるよう、申込ID と有効期限を認証付き暗号（AES-256-GCM + HKDF）で封入する。
 * トークン自体が表示権限を担保するため DB 保存は不要（ステートレス）。生 ID を
 * URL に出さないことで列挙による他人の申込サマリー閲覧を防ぐ。
 *
 * キャンセル・claim トークンとは `purpose` を分け、verify 側で purpose を明示検証する。
 * ステータス URL はメール経由で長期間残りやすいため、万一漏れてもキャンセル操作や
 * claim 用トークンには流用できないようにする狙い。
 *
 * Task 6 での mint 例:
 * ```ts
 * const expiresAt = new Date(Date.now() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS);
 * const token = createEventRegistrationStatusToken(registrationId, expiresAt);
 * return `${appUrl}/events/registrations/status?token=${token}`;
 * ```
 */

const PURPOSE = "event-registration-status";

/**
 * ステータストークンの推奨有効期間（発行時点から）。
 *
 * 開催後も領収書ダウンロードできるよう、mint 時刻から **90 日**。
 * 呼び出し側は `expiresAt = new Date(Date.now() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS)`
 * （または同等）で mint すること。トークン本体は rid+exp のみ保持する。
 */
export const EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS = 90 * MS_PER_DAY;

interface StatusTokenPayload {
  /** イベント参加申込ID（cuid） */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyEventRegistrationStatusTokenResult =
  { valid: true; registrationId: string } | { valid: false };

/**
 * ステータストークンを生成する。
 *
 * @param registrationId イベント参加申込ID
 * @param expiresAt 有効期限（この時刻を過ぎると無効）。通常は mint から
 *   {@link EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS}（90 日）後を渡す
 */
export function createEventRegistrationStatusToken(
  registrationId: string,
  expiresAt: Date,
): string {
  const payload: StatusTokenPayload = {
    rid: registrationId,
    exp: expiresAt.getTime(),
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * ステータストークンを検証する。
 *
 * 期限切れ・改ざん・他用途（キャンセル・claim 等）のトークンはすべて
 * `{ valid: false }` として扱う。ステータスページは無効時に汎用エラーへ
 * フォールバックするため、理由の区別は不要。
 *
 * @param token URL / cookie から受け取ったトークン
 * @param now 現在時刻
 */
export function verifyEventRegistrationStatusToken(
  token: string,
  now: Date,
): VerifyEventRegistrationStatusTokenResult {
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

  return { valid: true, registrationId: payload.rid };
}

function isStatusTokenPayload(value: unknown): value is StatusTokenPayload {
  if (!isRecord(value)) return false;
  return typeof value["rid"] === "string" && typeof value["exp"] === "number";
}
