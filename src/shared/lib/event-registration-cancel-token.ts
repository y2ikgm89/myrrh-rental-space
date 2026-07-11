import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";
import { tokenFingerprint as sharedTokenFingerprint } from "@/shared/lib/tokens/fingerprint";

/**
 * ゲストイベント参加申込キャンセル用トークン
 *
 * 会員でない参加者が確認メールのリンクからログインなしでキャンセルできるよう、
 * 申込ID と有効期限を `crypto.ts` の認証付き暗号（AES-256-GCM + HKDF）で封入する。
 * トークン自体が本人性を担保するため、DB へのトークン保存は不要（ステートレス）。
 * 設計・セキュリティ特性は `reservation-cancel-token.ts` と同一（purpose のみ分離）。
 *
 * - 改ざんは GCM の authTag で検知（→ invalid）
 * - 有効期限切れは `exp` で検知（→ expired）
 * - 暗号文は URL 安全な base64url で包む
 * - 発行時刻 `iat` を payload に含め、AuditLog 等のフォレンジックの土台として残す
 *
 * **クリーンアップ cron は不要**: ステートレス（AES-GCM authTag + exp claim）で
 * DB 行を持たないため。
 */

const PURPOSE = "event-registration-cancel";

/**
 * キャンセルトークンの最大有効期間（漏洩窓の上限）。
 *
 * イベントには予約のような「キャンセル受付期限（時間）」設定が無いため、自然な exp は
 * 「スロット開始時刻」そのものになる。半年先のイベントでは半年間生きるトークンになり、
 * 受信者のメールボックスや SMTP 中継・Resend ログが漏れた際の悪用窓が長くなるため、
 * 発行時点から 7 日に上限する（reservation-cancel-token.ts と同じ方針・同じ長さ）。
 */
export const MAX_CANCEL_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * トークンに焼く `exp`（有効期限）を計算する。
 *
 * `スロット開始時刻`（= 事実上の「キャンセル受付期限」）と
 * `発行時刻 + MAX_CANCEL_TOKEN_LIFETIME_MS` の **早い方** を返す。
 *
 * @param slotStartAt 申込対象タイムスロットの開始時刻
 * @param now 発行時刻（省略時は `new Date()`）
 */
export function computeCancelTokenExpiresAt(
  slotStartAt: Date,
  now: Date = new Date(),
): Date {
  const cappedExp = now.getTime() + MAX_CANCEL_TOKEN_LIFETIME_MS;
  return new Date(Math.min(slotStartAt.getTime(), cappedExp));
}

interface CancelTokenPayload {
  /** イベント参加申込ID */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
  /** 発行時刻（ms epoch）— 監査用 */
  iat: number;
}

export interface VerifiedCancelToken {
  valid: true;
  registrationId: string;
  issuedAt: number;
  expiresAt: number;
}

export type VerifyCancelTokenResult =
  VerifiedCancelToken | { valid: false; reason: "invalid" | "expired" };

/**
 * キャンセルトークンを生成する。
 *
 * @param registrationId イベント参加申込ID
 * @param expiresAt 有効期限（この時刻を過ぎると expired）
 * @param issuedAt 発行時刻（省略時は `new Date()`）
 */
export function createCancelToken(
  registrationId: string,
  expiresAt: Date,
  issuedAt: Date = new Date(),
): string {
  const payload: CancelTokenPayload = {
    rid: registrationId,
    exp: expiresAt.getTime(),
    iat: issuedAt.getTime(),
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * @deprecated 直接 `@/shared/lib/tokens/fingerprint` から import すること。
 */
export const tokenFingerprint = sharedTokenFingerprint;

/**
 * キャンセルトークンを検証する。
 *
 * @param token URL から受け取ったトークン
 * @param now 現在時刻
 */
export function verifyCancelToken(
  token: string,
  now: Date,
): VerifyCancelTokenResult {
  const ciphertext = Buffer.from(token, "base64url").toString("utf8");

  // purpose を明示検証（他用途トークンの流用を decrypt 前に拒否）。
  // wire format に応じて purpose の位置が異なる:
  //   v1: "v1:<purpose>:iv:tag:ct"          → parts[1]
  //   v2: "v2:<kid>:<purpose>:iv:tag:ct"    → parts[2]
  const parts = ciphertext.split(":");
  const version = parts[0];
  const purposeFromWire =
    version === "v2" ? parts[2] : version === "v1" ? parts[1] : null;
  if (purposeFromWire !== PURPOSE) {
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

  return {
    valid: true,
    registrationId: payload.rid,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}

function isCancelTokenPayload(value: unknown): value is CancelTokenPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value["rid"] === "string" &&
    typeof value["exp"] === "number" &&
    Number.isFinite(value["exp"]) &&
    typeof value["iat"] === "number" &&
    Number.isFinite(value["iat"])
  );
}
