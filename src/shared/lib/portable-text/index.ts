/**
 * Portable Text SSoT barrel — schema / factory / helpers の単一エントリ。
 *
 * Sanity Portable Text 公式仕様準拠 (`_type` discriminator, `_key` UUID)。
 * Inline Span (text / iconInline) と Block (paragraph) を提供。
 */

export {
  portableTextSpanSchema,
  portableTextBlockSchema,
  createSpanArraySchema,
  createBlockArraySchema,
} from "./schema";
export type {
  PortableTextSpan,
  PortableTextBlock,
  SpanTextToken,
  SpanIconToken,
} from "./schema";
export { createSpan, createInlineIcon, createBlock } from "./factory";
export { spansToPlainText, blocksToPlainText } from "./text";
