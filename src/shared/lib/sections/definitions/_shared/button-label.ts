/**
 * Button label の token 配列スキーマ
 *
 * Sanity Portable Text の inline blocks 互換モデル。`children` 配列内に
 * `{_key, type:"text"}` / `{_key, type:"icon"}` を兄弟として配置し、
 * テキストの任意位置にアイコンを挿入する。
 *
 * - text token: `{ _key: string, type: "text", value: string }` (max 200 chars)
 * - icon token: `{ _key: string, type: "icon", name: string }` (curation icon 名)
 *
 * `_key` は token ごとに永続化される一意 ID（Sanity Portable Text の `_key` 互換）。
 * React reconciliation の stable key + 並べ替え/挿入/削除時の identity 保持に使用。
 * editor (RichLabelInput) は token 生成時に `createTextToken` / `createIconToken` で
 * 自動付与する。DB 上の既存 token には migration で UUID を割り当て済み。
 *
 * 配列全体は `safeParse(undefined)` で `[]` にフォールバック（field defaults 契約）。
 * 業界 reference: Sanity Portable Text inline blocks / JVM Rich Text Icons
 */

import { z } from "zod";

const ICON_NAME_PATTERN = /^Icon[A-Z][A-Za-z0-9]*$/;

const tokenKeySchema = z.string().min(1, { error: "_key は必須です" });

const textTokenSchema = z.object({
  _key: tokenKeySchema,
  type: z.literal("text"),
  value: z.string().max(200, { error: "テキスト segment は200文字以内です" }),
});

const iconTokenSchema = z.object({
  _key: tokenKeySchema,
  type: z.literal("icon"),
  name: z
    .string()
    .min(1, { error: "アイコン名は必須です" })
    .max(64, { error: "アイコン名は64文字以内です" })
    .regex(ICON_NAME_PATTERN, {
      error: "アイコン名は IconXxx 形式で指定してください",
    }),
});

export const buttonLabelTokenSchema = z.discriminatedUnion("type", [
  textTokenSchema,
  iconTokenSchema,
]);

export const buttonLabelSchema = z
  .array(buttonLabelTokenSchema)
  .max(50, { error: "ラベル token は50件以内です" })
  .default([]);

export type ButtonLabelToken = z.infer<typeof buttonLabelTokenSchema>;
export type TextToken = Extract<ButtonLabelToken, { type: "text" }>;
export type IconToken = Extract<ButtonLabelToken, { type: "icon" }>;

export function isTextToken(token: ButtonLabelToken): token is TextToken {
  return token.type === "text";
}

export function isIconToken(token: ButtonLabelToken): token is IconToken {
  return token.type === "icon";
}

export function emptyLabel(): ButtonLabelToken[] {
  return [];
}

/**
 * `crypto.randomUUID()` で stable な `_key` を生成して text token を作る。
 * editor / seed / defaults / 移行スクリプトで利用。
 */
export function createTextToken(value: string): TextToken {
  return { _key: crypto.randomUUID(), type: "text", value };
}

/**
 * `crypto.randomUUID()` で stable な `_key` を生成して icon token を作る。
 */
export function createIconToken(name: string): IconToken {
  return { _key: crypto.randomUUID(), type: "icon", name };
}

/**
 * token 配列を plain text にフラット化（icon token は無視）。
 * a11y `aria-label` 派生・SR フォールバック・検索用 cache 等で使用。
 */
export function labelToPlainText(tokens: ButtonLabelToken[]): string {
  return tokens.map((t) => (isTextToken(t) ? t.value : "")).join("");
}
