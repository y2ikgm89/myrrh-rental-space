/**
 * Portable Text 公式準拠の Span / Block Zod schema
 *
 * 業界 reference:
 * - https://portabletext.org/
 * - https://www.sanity.io/docs/block-content
 *
 * 重要:
 * - 型 (`PortableTextSpan` / `PortableTextBlock` 等) は `./types` (zero runtime) に分離。
 *   この schema 側は `satisfies z.ZodType<...>` で型と zod schema を lockstep にする。
 * - barrel (`./index`) は schema 値を **意図的に re-export していない** (CSP nonce gap 構造予防)。
 *   client bundle に Zod schema chunk が混入し strict-dynamic CSP 下で nonce-less な
 *   Flight top-level <script> として CSP ブロックされるのを構造的に予防する。
 *   schema 値が必要な server コード / admin client (Conform parseWithZod / Lexical Decorator)
 *   はこのモジュールを直接 deep-import する: `@/shared/lib/portable-text/schema`。
 * - 強制: `__tests__/unit/architecture-boundaries.test.ts` の grep gate で client-graph
 *   (=`src/app/(public)/**`) からの schema value-import を禁止する。
 *
 * 関連:
 * - facebook/react#29978 / vercel/next.js#55590 (React Flight client-reference は
 *   nonce 注入 API を持たない上流バグ → 我々はトリガーパターンを構造的に断つ)
 */

import { z } from "zod";
import type { PortableTextSpan, PortableTextBlock } from "./types";

export type {
  PortableTextSpan,
  PortableTextBlock,
  SpanTextToken,
  SpanIconToken,
} from "./types";

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
]) satisfies z.ZodType<PortableTextSpan>;

export const portableTextBlockSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("block"),
  style: z.enum(["normal"]).default("normal"),
  children: z
    .array(portableTextSpanSchema)
    .max(200, { error: "Span は200件以内です" }),
}) satisfies z.ZodType<PortableTextBlock>;

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
