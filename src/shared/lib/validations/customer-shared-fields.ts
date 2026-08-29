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
/** 姓・名それぞれの上限。 */
export const PERSON_NAME_MAX_LENGTH = 50;

/**
 * 「姓 + 半角空白 + 名」で組んだ表示名の上限。
 *
 * `inquiries.name` のように姓名を 1 列へ連結して保存する箇所がある。**姓と名の
 * 上限をそのまま列長にすると 1 文字足りない** — 区切りの空白ぶんが入らず、
 * 上限いっぱいの氏名で 22001 になり、問い合わせ送信が 500 で失われる。
 * （`receipts.recipient_name` が VarChar(100) で同じ壊れ方をして Text へ移した）
 */
export const FULL_NAME_MAX_LENGTH = PERSON_NAME_MAX_LENGTH * 2 + 1;

/**
 * メールアドレスの上限。**DB の列長そのもの。**
 *
 * メールアドレスを保持する 12 列（`customers.email` / `event_registrations.email` /
 * `reservations.guest_email` / `pending_customer_email_changes.new_email` ほか）は
 * すべて `VarChar(254)` で揃っている。RFC 5321 の forward-path 上限 256 バイトから
 * 山括弧 2 つを引いた値でもある。
 *
 * **緩めた schema が実際に 500 を起こしていた。** 受付の当日参加 / 代行登録が
 * `.max(255)` だったため、255 文字ちょうどのアドレスは Zod を通って INSERT で
 * PostgreSQL 22001（value too long）になっていた。22001 は DomainError ではないので
 * 変換に乗らず 500 になり、画面には理由が出ない。値を 1 箇所に置いて、
 * 「helper を使わない事情がある schema」からもこの数だけは引けるようにする。
 */
export const EMAIL_MAX_LENGTH = 254;

export function personNameFieldSchema(label: string) {
  return z
    .string({ error: `${label}は必須です` })
    .trim()
    .min(1, { error: `${label}は必須です` })
    .max(PERSON_NAME_MAX_LENGTH, {
      error: `${label}は${PERSON_NAME_MAX_LENGTH}文字以内で入力してください`,
    });
}

/**
 * メールアドレスの形式判定。**`.pipe(z.email())` を使わない。**
 *
 * `.pipe()` は ZodString のチェーンを閉じるので、conform の `getZodConstraint` が
 * `minLength` / `maxLength` を拾えなくなる（実測: `.trim().min(1).max(255).pipe(z.email())`
 * は `{required:true}` だけを返し、`maxlength="255"` が入力欄から消える）。
 * `z.string().email()` はチェーンを保つが Zod 4 で `@deprecated`。
 *
 * 判定だけを公式の top-level `z.email()` から借りて `.refine()` に載せると、
 * 公式 API のまま制約も残る。メールを検証する箇所はすべてこれを使う。
 *
 * **スキーマは module スコープに置くこと。** 呼び出しごとに `z.email()` を作ると
 * 構築費 1376 ns が判定費を飲む（実測 Node/V8: 毎回構築 1885 ns 対 使い回し 96 ns）。
 * この関数は `emailFieldSchema` の `.refine()` から全フォームの検証で踏まれる。
 */
const emailFormatSchema = z.email();

export function isEmailFormat(value: string): boolean {
  return z.validate(emailFormatSchema, value);
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
  // RFC 5321 の上限（forward-path 256 バイトから山括弧 2 つを引いた 254）。
  // **DB 側の列長そのものでもある** — メールアドレスを保持する 12 列
  // （`customers.email` / `event_registrations.email` / `reservations.guest_email` /
  // `terms_agreements.guest_email` ほか）はすべて `VarChar(254)` で揃っている。
  // つまり 1 文字でも緩めると DB が受け取れない値を通すことになり、書込は
  // PostgreSQL 22001（value too long）になる。**22001 は DomainError ではないので
  // 変換に乗らず 500 になり、利用者には理由が出ない。**
  //
  // `.trim()` より後ろに置くこと（実測: 逆順だと空白込みで数え、見た目 254 文字の
  // 貼り付けが弾かれる）。`.refine()` との前後は制約出力に影響しない（実測）が、
  // 上の docblock のとおり `.pipe()` に置き換えるとチェーンが閉じて
  // `getZodConstraint` が `maxLength` を落とす。
  .max(EMAIL_MAX_LENGTH, {
    error: `メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`,
  })
  .refine(isEmailFormat, { error: "有効なメールアドレスを入力してください" });

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
