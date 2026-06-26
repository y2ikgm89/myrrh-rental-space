/**
 * Portable Text factory helpers — `crypto.randomUUID()` で stable な `_key` を生成。
 * editor / seed / defaults / migration script で利用。
 */

import type {
  PortableTextSpan,
  PortableTextBlock,
  SpanTextToken,
  SpanIconToken,
} from "./types";

export function createSpan(text: string): SpanTextToken {
  return { _key: crypto.randomUUID(), _type: "span", text };
}

export function createInlineIcon(name: string): SpanIconToken {
  return { _key: crypto.randomUUID(), _type: "iconInline", name };
}

export function createBlock(children: PortableTextSpan[]): PortableTextBlock {
  return {
    _key: crypto.randomUUID(),
    _type: "block",
    style: "normal",
    children,
  };
}
