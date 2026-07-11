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
    .min(1, { error: `${label}は必須です` })
    .max(50, { error: `${label}は50文字以内で入力してください` });
}

/**
 * 顧客メールアドレス (Zod 4 top-level `z.email`)。
 */
export const emailFieldSchema = z.email({
  error: "有効なメールアドレスを入力してください",
});

/**
 * 任意電話番号 (最大 20 文字、空文字許容)。
 *
 * customer.ts は追加で regex を掛けているためこの helper を使わず個別維持。
 * 空文字受容は conform の empty→undefined 変換前に許容するため `.or(z.literal(""))`。
 */
export const optionalPhoneNumberSchema = z
  .string()
  .max(20, { error: "電話番号は20文字以内で入力してください" })
  .optional()
  .or(z.literal(""));
