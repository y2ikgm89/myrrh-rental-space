/**
 * 顧客系フォームで共通する Zod field schema SSoT。
 *
 * 顧客・予約・問い合わせフォームで一字一句同じ error message / 長さ制約を
 * 個別に書いていた drift を集約する。適用 file は customer.ts /
 * public-reservation.ts / inquiry.ts / customer-profile.ts の 4 file。
 * customer-profile.ts は lastName / firstName の独自 label ("姓を入力してください")
 * を維持しているため personNameFieldSchema は使わないが、phoneNumber は
 * `optionalPhoneNumberSchema` と byte 一致のため helper を経由する。
 */

import { z } from "zod";

/**
 * 姓・名フィールド (必須 1〜50 文字)。
 *
 * `label` は表示用ラベル ("姓" / "名")。error は `${label}は必須です` /
 * `${label}は50文字以内で入力してください` に統一する。
 */
export function personNameFieldSchema(label: string) {
  return z
    .string()
    .trim()
    .min(1, { error: `${label}は必須です` })
    .max(50, { error: `${label}は50文字以内で入力してください` });
}

/**
 * 顧客メールアドレス。
 *
 * **trim してから形式検証する。** 素の `z.email()` は `" a@example.com"` を
 * 拒否するので、貼り付けに空白が紛れただけで「有効なメールアドレスを入力して
 * ください」が出る — 利用者には打ち間違いに見えない。`z.string().trim()` を
 * 前段に置いて正規化してから `z.email()` に渡す。
 *
 * conform の制約出力は変わらない（実測: 素の `z.email()` も
 * `z.string().trim().pipe(z.email())` も `getZodConstraint` は
 * `{ required: true }` を返す）。
 */
export const emailFieldSchema = z
  // `error` は外側にも要る。conform は空の FormData 値を `undefined` に畳むので、
  // 未入力はこの `z.string()` で落ちる。ここを素の `z.string()` にすると
  // Zod 既定の英語メッセージ（"Invalid input: expected string, received undefined"）が
  // **公開フォームにそのまま出る**（実測。#1835 の退行）。
  .string({ error: "有効なメールアドレスを入力してください" })
  .trim()
  .pipe(z.email({ error: "有効なメールアドレスを入力してください" }));

/**
 * 任意電話番号 (最大 20 文字、空文字許容)。
 *
 * customer.ts は追加で regex を掛けているためこの helper を使わず個別維持。
 * 空文字受容は conform の empty→undefined 変換前に許容するため `.or(z.literal(""))`。
 */
export const optionalPhoneNumberSchema = z
  .string()
  .trim()
  .max(20, { error: "電話番号は20文字以内で入力してください" })
  .optional()
  .or(z.literal(""));
