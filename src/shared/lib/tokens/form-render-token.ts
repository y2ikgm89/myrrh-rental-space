import "server-only";

import { encrypt, decrypt } from "@/shared/lib/crypto";
import { isRecord } from "@/shared/lib/serialize";

/**
 * 公開フォームの「いつ配られたか」をサーバー自身が刻んだトークン。
 *
 * ## なぜ要るのか
 *
 * bot 判定の時間トラップは、フォームのマウント時刻と送信時刻の差が短すぎるかを見る。
 * 旧実装はマウント時刻を**ブラウザの** `Date.now()` で焼き、サーバーが**サーバーの**
 * `Date.now()` から引いていた（監査 F-71）。
 *
 * 端末の時計が S 秒進んでいると差は「実入力時間 − S」になる。NTP 同期していない PC の
 * 時計が 5 分進んでいる利用者が /reservation で 2 分かけて入力して送信すると、
 * 差は約 −180000ms になり、**必ず bot と判定されて拒否される**。押し直しても同じで、
 * フォームを 5 分以上開いたままにするまで一度も予約が成立しない。お問い合わせ
 * フォーム（入力 30 秒〜2 分）では 1 分程度のずれで同じことが起きる。
 * 逆に時計が遅れている端末では差が過大になり、時間トラップが常に素通りする。
 *
 * **クライアントの時計をサーバー時刻と比較しない。** サーバーが自分で発行した時刻を
 * 暗号化して渡し、返ってきたものを自分の時計とだけ突き合わせる。
 * 署名付きなので、値を書き換えて時間トラップを回避することもできない。
 *
 * ## 使い方
 *
 * Server Component（ページ）で `createFormRenderToken()` を呼び、フォームに prop で
 * 渡す。クライアントは hidden input でそのまま返す。Server Action は
 * `checkBotHeuristics({ formRenderToken })` に渡す。
 *
 * 期限は `FORM_RENDER_TOKEN_TTL_MS`。長く開いたままのタブから送ると期限切れになるが、
 * その場合は「短すぎる」とは判定しない（＝ bot 扱いしない）。時間トラップの目的は
 * **速すぎる送信を弾くこと**であって、遅い送信を弾くことではない。
 */

const PURPOSE = "form-render";

/** トークンの有効期限（24 時間）。これを超えた送信は判定不能として通す。 */
export const FORM_RENDER_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export function createFormRenderToken(): string {
  const payload = { renderedAt: Date.now() };
  const ciphertext = encrypt(JSON.stringify(payload), { purpose: PURPOSE });
  return Buffer.from(ciphertext, "utf8").toString("base64url");
}

/**
 * トークンからサーバー発行時刻を復元する。
 *
 * @returns 発行からの経過ミリ秒。復号・期限切れ・形式不正はすべて `null`
 *          （＝「判定できない」であって「bot」ではない）。
 */
export function readFormRenderElapsedMs(token: string): number | null {
  let ciphertext: string;
  try {
    ciphertext = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }

  let raw: string;
  try {
    raw = decrypt(ciphertext, { expectedPurpose: PURPOSE }).toString("utf8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  const renderedAt = parsed["renderedAt"];
  if (typeof renderedAt !== "number") return null;

  const elapsed = Date.now() - renderedAt;
  // 未来の発行時刻（あり得ないが、値が壊れている）と期限切れは判定不能。
  if (elapsed < 0 || elapsed > FORM_RENDER_TOKEN_TTL_MS) return null;

  return elapsed;
}
