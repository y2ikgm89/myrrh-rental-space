/**
 * Portable Text barrel — CLIENT-SAFE.
 *
 * 公開する surface area:
 * - types: `./types` から再エクスポート (zero runtime)
 * - 純粋ヘルパー: `./factory` `./text` (zod を引かない、type-only import 経由)
 *
 * Zod schema (`createSpanArraySchema` / `createBlockArraySchema` /
 * `portableTextSpanSchema` / `portableTextBlockSchema`) は **意図的に re-export していない**。
 * server / admin client (Conform parseWithZod / Lexical Decorator) は `./schema` モジュールを
 * 直接 deep-import すること:
 *
 *   import { createSpanArraySchema } from "@/shared/lib/portable-text/schema";
 *
 * 背景: strict-dynamic CSP 下で `/login` 等の client bundle に Zod schema chunk が
 * 混入し、React Flight client-reference serializer が nonce 注入 API を持たない
 * (facebook/react#29978, vercel/next.js#55590) ため top-level <script> として
 * CSP ブロックされる問題の構造的予防。
 *
 * 強制: `__tests__/unit/architecture-boundaries.test.ts` の grep gate で
 * `src/app/(public)/**` からの schema value-import を禁止する。
 */

export type {
  PortableTextSpan,
  PortableTextBlock,
  SpanTextToken,
  SpanIconToken,
} from "./types";
export { createSpan, createInlineIcon, createBlock } from "./factory";
export { spansToPlainText, blocksToPlainText } from "./text";
