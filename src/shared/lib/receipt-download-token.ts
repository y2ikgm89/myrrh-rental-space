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
 * 認証済み顧客が mypage から DL する場合、Route Handler の GET が Better Auth session
 * の customer.id と Receipt.reservation.customerId / eventRegistration.customerId を
 * 突合する。トークン不要。
 *
 * ## 経路 2: 署名 URL (本トークン) — 2-step flow (HTTP-02)
 * ゲスト予約 (customerId=null) からメール本文リンク経由で DL する場合、
 * Better Auth session が存在しないため署名トークン検証で ownership を担保する。
 * メールから発行 → **24 時間有効** (RECEIPT-USEDAT-P1)。
 *
 * 実際のフローは以下の 2-step:
 * 1. メール内リンク: `/receipts/[serialNo]/download?token=<sig>` (公開 confirm page)
 * 2. ユーザーが「領収書 PDF をダウンロードする」ボタンを押下
 *    → `<form method="POST">` が `/api/receipts/[serialNo]/pdf` を叩く
 *    → Route Handler POST が `verifyReceiptDownloadToken` + `claimReceiptForSingleUseTokenDownload`
 *
 * ## HTTP-02: POST claim にした理由
 * 旧: メール本文リンクを直接 `/api/receipts/[serialNo]/pdf?token=` に繋げていた。
 * Outlook SafeLinks / Gmail preview / Slack unfurl / iMessage / Discord embed 等の
 * link scanner が GET プリフェッチで実 URL を fetch → `usedAt` が消費され、
 * ゲスト本人のクリック時に 404 になる fail mode が発覚。実質的に全ゲストが
 * 領収書を受け取れない状態だった。
 *
 * 対策: RFC 9110 の safe-method 契約 (POST は副作用を伴う可能性を認識して scanner
 * がスキップする) を利用し、実 claim を POST 経由に切り分けた。GET は confirm page
 * 描画 (副作用ゼロ) と Better Auth session 経路 (mypage) のみを受け持つ。
 *
 * ## 設計
 * `event-registration-claim-token.ts` と同型 (crypto.ts の encrypt/decrypt + purpose 分離
 * + payload の exp)。purpose を "receipt-download" として分離することで、トークン漏洩時に
 * 他 purpose (claim / cancel) の悪用を封じる。
 *
 * ## TTL 24h の根拠 (RECEIPT-USEDAT-P1)
 * 本トークンの主防御は `Receipt.usedAt` による **single-use gate** (`route.ts` の
 * advisory-lock tx で「未使用なら DL 成功 + usedAt 刻印、以降 404」)。TTL は
 * fallback (ユーザーがメールを翌朝開くフロー等) の窓口として機能する。
 *
 * 24h は freee / Money Forward Cloud 等の請求書 SaaS が採用する「単発トークン化
 * された領収書 URL」の業界水準と一致する。旧 60 分は「メール受信直後に DL」を
 * 前提としており、実運用のフローと乖離していた (問い合わせが多発)。
 */

const PURPOSE = "receipt-download";

/**
 * 領収書 DL トークンの有効期限 = 24 時間。
 *
 * `Receipt.usedAt` の single-use gate が漏洩対策の主防御であり、TTL は
 * 「メールを翌朝開く」ユースケース向けの fallback。旧 60 分から延長した
 * 理由と業界水準の詳細はモジュール docstring 参照。
 */
export const MAX_RECEIPT_DOWNLOAD_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

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
