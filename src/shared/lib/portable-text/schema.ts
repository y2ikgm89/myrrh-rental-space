/**
 * Portable Text 公式準拠の Span / Block schema
 *
 * 業界 reference:
 * - https://portabletext.org/
 * - https://www.sanity.io/docs/block-content
 *
 * - Span: inline token (`_type: "span" | "iconInline"`)
 * - Block: 段落単位 (`_type: "block"`, `children: PortableTextSpan[]`)
 *
 * `_key` は配列要素の stable identity（React reconciliation + 並べ替え/挿入/削除）。
 * 配列全体は `safeParse(undefined)` で `[]` にフォールバック（field defaults 契約）。
 */

import { z } from "zod";

const ICON_NAME_PATTERN = /^Icon[A-Z][A-Za-z0-9]*$/;
const tokenKeySchema = z.string().min(1, { error: "_key は必須です" });

const spanTokenSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("span"),
  text: z.string().max(500, { error: "テキストは500文字以内です" }),
});

const iconInlineTokenSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("iconInline"),
  name: z
    .string()
    .min(1, { error: "アイコン名は必須です" })
    .max(64, { error: "アイコン名は64文字以内です" })
    .regex(ICON_NAME_PATTERN, {
      error: "アイコン名は IconXxx 形式で指定してください",
    }),
});

export const portableTextSpanSchema = z.discriminatedUnion("_type", [
  spanTokenSchema,
  iconInlineTokenSchema,
]);

export const portableTextBlockSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("block"),
  style: z.enum(["normal"]).default("normal"),
  children: z
    .array(portableTextSpanSchema)
    .max(200, { error: "Span は200件以内です" }),
});

export type PortableTextSpan = z.infer<typeof portableTextSpanSchema>;
export type PortableTextBlock = z.infer<typeof portableTextBlockSchema>;
export type SpanTextToken = Extract<PortableTextSpan, { _type: "span" }>;
export type SpanIconToken = Extract<PortableTextSpan, { _type: "iconInline" }>;

interface SpanArrayOpts {
  readonly maxSpans?: number;
}

// conform FormData transit では hidden input に JSON.stringify した配列が乗るため、
// string → array へ復元する preprocess を schema 側に持たせる
// (field.number / field.boolean と同様の object literal / FormData 両対応 pattern)。
function decodePortableTextInput(v: unknown): unknown {
  if (typeof v !== "string") return v;
  if (v === "") return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/**
 * Inline Span 配列スキーマ factory（短いラベル / 見出し / リンクテキスト用）。
 * `safeParse(undefined)` で `[]` フォールバック契約。
 */
export function createSpanArraySchema(opts: SpanArrayOpts = {}) {
  const maxSpans = opts.maxSpans ?? 50;
  return z
    .preprocess(
      decodePortableTextInput,
      z
        .array(portableTextSpanSchema)
        .max(maxSpans, { error: `Span は${maxSpans}件以内です` }),
    )
    .default([]);
}

interface BlockArrayOpts {
  readonly maxBlocks?: number;
}

/**
 * Block 配列スキーマ factory（長文 textarea 用）。
 * `safeParse(undefined)` で `[]` フォールバック契約。
 */
export function createBlockArraySchema(opts: BlockArrayOpts = {}) {
  const maxBlocks = opts.maxBlocks ?? 50;
  return z
    .preprocess(
      decodePortableTextInput,
      z
        .array(portableTextBlockSchema)
        .max(maxBlocks, { error: `Block は${maxBlocks}件以内です` }),
    )
    .default([]);
}
