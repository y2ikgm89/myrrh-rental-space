import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * 予約 claim トークン
 *
 * ゲスト予約完了ページ・確認メール・リマインダーメールの「マイページに追加」導線で使う。
 * 予約ID と有効期限を認証付き暗号（AES-256-GCM + HKDF）で封入する、ステートレスなトークン。
 *
 * emailの一致では判断しない。このトークンの保有（=確認メール/完了ページへのアクセス）と、
 * claim 実行時点の OAuth 認証（Google/LINE が保証する identity）の両方が揃って初めて
 * 「その予約1件だけ」を再紐付けする（`src/shared/domain/reservations/claim-commands.ts` 参照）。
 *
 * キャンセルトークン（`reservation-cancel-token.ts`）とは purpose を分け、verify 側で
 * purpose を明示検証する（他用途トークンの流用防止、`crypto.ts` の設計に準拠）。
 */

const PURPOSE = "reservation-claim";

/** トークンの最大有効期間（発行から固定7日）。キャンセルトークンと異なり予約開始時刻に
 *  連動する可変上限は不要（claim は予約の実行タイミングに影響しない操作のため）。 */
export const MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

interface ClaimTokenPayload {
  /** 予約ID（UUID） */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
}

export type VerifyReservationClaimTokenResult =
  { valid: true; reservationId: string } | { valid: false };

/**
 * claim トークンを生成する。
 *
 * @param reservationId 予約ID
 * @param issuedAt 発行時刻（省略時は `new Date()`）。有効期限は発行時刻+7日固定。
 */
export function createReservationClaimToken(
  reservationId: string,
  issuedAt: Date = new Date(),
): string {
  const payload: ClaimTokenPayload = {
    rid: reservationId,
    exp: issuedAt.getTime() + MAX_RESERVATION_CLAIM_TOKEN_LIFETIME_MS,
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * claim トークンを検証する。
 *
 * 期限切れ・改ざん・他用途（キャンセル等）のトークンはすべて `{ valid: false }` として扱う
 * （理由の区別は不要、`reservation-complete-token.ts` と同方針）。
 */
export function verifyReservationClaimToken(
  token: string,
  now: Date,
): VerifyReservationClaimTokenResult {
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

  return { valid: true, reservationId: payload.rid };
}

function isClaimTokenPayload(value: unknown): value is ClaimTokenPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value["rid"] === "string" &&
    typeof value["exp"] === "number" &&
    Number.isFinite(value["exp"])
  );
}
