/**
 * 設定フォーム共通ヘルパー。
 *
 * conform の `parseWithZod`（@conform-to/zod/v4）は空入力を `undefined` に変換する
 * （空文字 "" はスキーマに届かない）。そのため任意項目・Switch 由来 boolean は
 * `undefined` を許容するスキーマにしないと「空欄保存 / OFF 保存」が
 * `expected string/boolean, received undefined` で全て弾かれる。
 *
 * ここでその差異を吸収する schema ビルダーと、Server Action 送信前の正規化を提供する。
 */
import { z } from "zod";

/**
 * 空文字列 / undefined → null 変換（Server Action で domain command に渡す前に使用）。
 *
 * conform 経由の FormData では任意フィールドが `undefined`（空欄）または `""` で届く。
 * domain command は `string | null` を要求するため、ここで null へ正規化する。
 */
export function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Switch / checkbox 由来の boolean フォーム値。
 *
 * Switch は OFF のとき hidden input に `""` を送り、conform がそれを `undefined` 化する。
 * bare `z.boolean()` は `undefined` を弾くため「OFF のまま保存」が必ず失敗する。
 * `default(false)` で「未送信（OFF）= false」を担保する。
 *
 * `z.preprocess` ではなく `default` を採用する理由: preprocess は実 boolean 入力を
 * 受けると値を破壊しうる（`preprocess(v => v === "on").parse(true) === false`）。
 * `default` は `undefined` のみを補完し、`"on"`→true / `true`→true を保持する。
 */
export function switchBoolean() {
  return z.boolean().default(false);
}

/**
 * 任意テキスト（最大長つき）。
 *
 * conform の空→undefined を許容するため `.optional()`。空入力は Server Action 側の
 * {@link emptyToNull} で `null` 化して永続化する。
 */
export function optionalText(max: number, message?: string) {
  return z
    .string()
    .max(max, { error: message ?? `${max}文字以内で入力してください` })
    .optional();
}
