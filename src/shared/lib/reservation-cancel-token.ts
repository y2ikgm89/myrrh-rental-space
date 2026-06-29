import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

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
 * - 発行時刻 `iat` を payload に含め、AuditLog 等のフォレンジック・将来の
 *   発行世代ベース revocation のための土台として残す
 *
 * **クリーンアップ cron は不要**: ステートレス（AES-GCM authTag + exp claim）で
 * DB 行を持たないため。漏洩面は受信者のメールボックスと Resend のログのみで、
 * `exp` まで有効、`exp` 経過後は decrypt 成功しても expired として拒否される。
 */

import { createHash } from "node:crypto";

const PURPOSE = "reservation-cancel";

/**
 * キャンセルトークンの最大有効期間（漏洩窓の上限）。
 *
 * 自然な exp は「予約開始時刻 − cancellationDeadlineHours」だが、半年先の予約
 * では半年間生きるトークンになるため、受信者のメールボックスや SMTP 中継・
 * Resend ログが漏れた際の悪用窓が長くなる。トークンの寿命を **発行時点から
 * 7 日** に上限することで、policy が許す期間より早くトークンが死ぬ可能性は
 * あるが、漏洩リスクを構造的に制限する。
 *
 * **キャップが当たった場合のユーザー導線**:
 *   - 会員: マイページ `/mypage/reservations` から直接キャンセル可
 *   - ゲスト: お問い合わせから連絡（リマインダ送信で新しいトークンが再発行される）
 *
 * リマインダーは送信時点で新トークンを焼き直すため、通常は cap が当たらず
 * policy 上限まで生きる（実害ケースは「ずっと先の予約 × 確認メール」だけ）。
 */
export const MAX_CANCEL_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * トークンに焼く `exp`（有効期限）を計算する。
 *
 * `policy 期限`（予約開始時刻 − cancellationDeadlineHours）と
 * `発行時刻 + MAX_CANCEL_TOKEN_LIFETIME_MS` の **早い方** を返す。
 *
 * @param startTime 予約開始時刻
 * @param cancellationDeadlineHours キャンセル受付期限（時間）
 * @param now 発行時刻（省略時は `new Date()`）
 */
export function computeCancelTokenExpiresAt(
  startTime: Date,
  cancellationDeadlineHours: number,
  now: Date = new Date(),
): Date {
  const policyExp =
    startTime.getTime() - cancellationDeadlineHours * 60 * 60 * 1000;
  const cappedExp = now.getTime() + MAX_CANCEL_TOKEN_LIFETIME_MS;
  return new Date(Math.min(policyExp, cappedExp));
}

interface CancelTokenPayload {
  /** 予約ID（UUID） */
  rid: string;
  /** 有効期限（ms epoch） */
  exp: number;
  /** 発行時刻（ms epoch）— 監査と将来の世代ベース revocation 用 */
  iat: number;
}

export interface VerifiedCancelToken {
  valid: true;
  reservationId: string;
  issuedAt: number;
  expiresAt: number;
}

export type VerifyCancelTokenResult =
  VerifiedCancelToken | { valid: false; reason: "invalid" | "expired" };

/**
 * キャンセルトークンを生成する。
 *
 * @param reservationId 予約ID
 * @param expiresAt 有効期限（この時刻を過ぎると expired）
 * @param issuedAt 発行時刻（省略時は `new Date()`）
 */
export function createCancelToken(
  reservationId: string,
  expiresAt: Date,
  issuedAt: Date = new Date(),
): string {
  const payload: CancelTokenPayload = {
    rid: reservationId,
    exp: expiresAt.getTime(),
    iat: issuedAt.getTime(),
  };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * トークンの SHA-256 指紋を返す（先頭 16 文字）。
 *
 * 平文トークンを監査ログ・WARNING ログに残さないために使う。
 * 同一トークンが繰り返し試されているか / 異なるトークンが回されているかを
 * 識別できる程度の粒度。
 */
export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
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

  // purpose を明示検証（予約完了トークン等の他用途トークンの流用を decrypt 前に拒否）。
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
    reservationId: payload.rid,
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
