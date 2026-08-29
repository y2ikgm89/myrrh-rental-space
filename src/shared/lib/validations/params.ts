/**
 * 読み取り専用関数のパラメータバリデーション
 *
 * 'use cache' 関数の入口でユーザー入力（URLスラッグ、ID等）を検証。
 * 防御的プログラミング: 不正な入力をDB到達前にブロック。
 */

import { z } from "zod";

/**
 * URL スラッグ正規表現の SSoT。
 * 小文字英数字 + 単一ハイフン区切り（先頭/末尾/連続ハイフンを許さない）。
 * 読み取り側パラメータ検証（slugParamSchema）に加え、書き込み側フォーム検証
 * （page / location）と CreatePageDialog の client 即時検証も本定数を参照する。
 */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * URLスラッグパラメータ（小文字英数字 + ハイフン、1-100文字）
 */
// eslint-disable-next-line local/require-trimmed-text -- URL の path segment
export const slugParamSchema = z.string().min(1).max(100).regex(SLUG_REGEX);

/**
 * エンティティIDパラメータ（形式を問わない、1-100文字）
 */
// eslint-disable-next-line local/require-trimmed-text -- 同上
export const idParamSchema = z.string().min(1).max(100);

/**
 * `slugParamSchema` / `idParamSchema` の形式判定。
 *
 * 中身は Zod 4.5 の `z.validate()`。`ZodError` を組み立てないので、**不正入力の
 * 棄却が `.safeParse().success` より一桁速い**（実測 8〜21 倍）。これらは
 * `'use cache'` 関数の入口で毎回踏まれる untrusted な URL パラメータの門なので、
 * 速いのは棄却側でよい。
 *
 * **`boolean` に落として返すのが要点。** `z.validate()` が返すのはスキーマの
 * 入力型に対する型ガード（`value is string`）で、引数が既に `string` だと
 * `if (!…)` の否定側が `never` に狭まる。呼び出し側がその枝で値をログや
 * メッセージに使えなくなるので、ここで boolean へ落としきる。
 */
export function isSlugParam(value: string): boolean {
  return z.validate(slugParamSchema, value);
}

export function isIdParam(value: string): boolean {
  return z.validate(idParamSchema, value);
}

/**
 * UUID 形式のエンティティ ID スキーマファクトリ。
 *
 * 管理 action / query / route handler で個別に宣言されていた
 * `z.uuid({ error: "XXX IDが不正です" })` を集約し、エラー文言の
 * 揺れ（"IDが不正です" / "ユーザーIDが不正です" 等）を構造的に解消する。
 *
 * @param entityLabel エラーメッセージの先頭に付与するエンティティ名（例: "クーポン"）
 */
export function uuidIdSchema(entityLabel: string) {
  return z.uuid({ error: `${entityLabel}IDが不正です` });
}
