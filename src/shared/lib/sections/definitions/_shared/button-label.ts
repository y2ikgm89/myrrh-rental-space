/**
 * Button label の token 配列スキーマ
 *
 * Sanity Portable Text の inline blocks 互換モデル。`children` 配列内に
 * `{type:"text"}` / `{type:"icon"}` を兄弟として配置し、テキストの任意位置に
 * アイコンを挿入する。
 *
 * - text token: `{ type: "text", value: string }` (max 200 chars)
 * - icon token: `{ type: "icon", name: string }` (curation icon 名)
 *
 * 配列全体は `safeParse(undefined)` で `[]` にフォールバック（field defaults 契約）。
 * 業界 reference: Sanity Portable Text inline blocks / JVM Rich Text Icons
 */

import { z } from "zod";

const ICON_NAME_PATTERN = /^Icon[A-Z][A-Za-z0-9]*$/;

const textTokenSchema = z.object({
  type: z.literal("text"),
  value: z.string().max(200, { error: "テキスト segment は200文字以内です" }),
});

const iconTokenSchema = z.object({
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
 * token 配列を plain text にフラット化（icon token は無視）。
 * a11y `aria-label` 派生・SR フォールバック・検索用 cache 等で使用。
 */
export function labelToPlainText(tokens: ButtonLabelToken[]): string {
  return tokens.map((t) => (isTextToken(t) ? t.value : "")).join("");
}
