import "server-only";

import { createHash } from "node:crypto";

import { decrypt, encrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * カレンダー (.ics) ダウンロード用 署名付きトークン
 *
 * 会員でない予約者・イベント参加者が確認メール / リマインダの「iCal (.ics)」リンクから
 * ログインなしで .ics をダウンロードできるよう、対象 ID (予約 ID または申込 ID) と
 * 有効期限を `crypto.ts` の認証付き暗号 (AES-256-GCM + HKDF) で封入する。
 * トークン自体がアクセス権を担保するため、DB 行は不要 (ステートレス)。
 *
 * - 改ざんは GCM の authTag で検知 → invalid
 * - 有効期限切れは `exp` で検知 → expired
 * - URL 安全な base64url で運ぶ
 * - `kind` で予約 / イベントを分離し、reservation-cancel-token 等の他用途トークン流用を防ぐ
 *
 * **設計上の前提**: メール内 `.ics` リンクのライフタイム上限は **30 日**。
 * 受信者のメールボックスや Resend ログが漏れた際の悪用窓を構造的に制限する。
 * 30 日を超える先の予約の場合でも、予約・申込 ID の slice prefix を保持したファイル
 * 名 (`reservation-XXXXXXXX.ics`) として既にメールに添付されているか、最新の確認メール /
 * リマインダで新トークンが再発行されるため、ユーザー体験は劣化しない。
 *
 * cron による掃除は不要 (ステートレスで DB 行を持たない)。
 */

const PURPOSE_PREFIX = "calendar-download";

/**
 * カレンダー .ics トークンの最大有効期間 (30 日)。
 * メール本文の .ics リンクの寿命であり、漏洩窓の上限。
 */
export const CALENDAR_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type CalendarTokenKind = "reservation" | "event";

interface CalendarTokenPayload {
  /** 対象種別 (reservation = Reservation.id / event = EventRegistration.id) */
  k: CalendarTokenKind;
  /** 対象 ID */
  id: string;
  /** 有効期限 (ms epoch) */
  exp: number;
  /** 発行時刻 (ms epoch) — 監査 / 将来の世代ベース revocation 用 */
  iat: number;
}

export interface VerifiedCalendarToken {
  valid: true;
  kind: CalendarTokenKind;
  targetId: string;
  issuedAt: number;
  expiresAt: number;
}

export type VerifyCalendarTokenResult =
  VerifiedCalendarToken | { valid: false; reason: "invalid" | "expired" };

/**
 * カレンダートークンの HKDF purpose を種別ごとに生成する。
 * `__tests__/unit/architecture/crypto-purpose-registry.test.ts` が
 * `SETTINGS_CRYPTO_PURPOSES` 等の他の purpose と衝突しないことを確認するために import する。
 */
export function purposeFor(kind: CalendarTokenKind): string {
  // Purpose is stored inside a colon-delimited crypto wire format.
  return `${PURPOSE_PREFIX}-${kind}`;
}

/**
 * カレンダー .ics トークンを発行する。
 *
 * @param kind reservation または event
 * @param targetId 対象 ID
 * @param now 発行時刻 (省略時は `new Date()`)
 */
export function createCalendarToken(
  kind: CalendarTokenKind,
  targetId: string,
  now: Date = new Date(),
): string {
  const payload: CalendarTokenPayload = {
    k: kind,
    id: targetId,
    exp: now.getTime() + CALENDAR_TOKEN_LIFETIME_MS,
    iat: now.getTime(),
  };
  const ciphertext = encrypt(JSON.stringify(payload), {
    purpose: purposeFor(kind),
  });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * カレンダー .ics トークンの SHA-256 指紋 (先頭 16 文字)。
 * 平文トークンを監査ログに残さないために使う。
 */
export function calendarTokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * カレンダー .ics トークンを検証する。
 *
 * @param token URL から受け取ったトークン
 * @param expectedKind ルートが期待する種別 (reservation または event)
 * @param now 現在時刻
 */
export function verifyCalendarToken(
  token: string,
  expectedKind: CalendarTokenKind,
  now: Date = new Date(),
): VerifyCalendarTokenResult {
  let ciphertext: string;
  try {
    ciphertext = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return { valid: false, reason: "invalid" };
  }

  // purpose を明示検証 (他用途トークンの流用や reservation⇔event 交差を decrypt 前に弾く)。
  // wire format:
  //   v1: "v1:<purpose>:iv:tag:ct"          → parts[1]
  //   v2: "v2:<kid>:<purpose>:iv:tag:ct"    → parts[2]
  const parts = ciphertext.split(":");
  const version = parts[0];
  const purposeFromWire =
    version === "v2" ? parts[2] : version === "v1" ? parts[1] : null;
  if (purposeFromWire !== purposeFor(expectedKind)) {
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

  if (!isCalendarTokenPayload(payload)) {
    return { valid: false, reason: "invalid" };
  }

  if (payload.k !== expectedKind) {
    return { valid: false, reason: "invalid" };
  }

  if (payload.exp < now.getTime()) {
    return { valid: false, reason: "expired" };
  }

  return {
    valid: true,
    kind: payload.k,
    targetId: payload.id,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
  };
}

function isCalendarTokenPayload(value: unknown): value is CalendarTokenPayload {
  if (!isRecord(value)) return false;
  const kind = value["k"];
  return (
    (kind === "reservation" || kind === "event") &&
    typeof value["id"] === "string" &&
    typeof value["exp"] === "number" &&
    Number.isFinite(value["exp"]) &&
    typeof value["iat"] === "number" &&
    Number.isFinite(value["iat"])
  );
}
