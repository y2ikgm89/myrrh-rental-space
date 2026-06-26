/**
 * Portable Text → plain text 変換 helper。
 * a11y `aria-label` 派生・SR フォールバック・検索 cache 等で使用。
 */

import type { PortableTextSpan, PortableTextBlock } from "./types";

export function spansToPlainText(spans: PortableTextSpan[]): string {
  return spans.map((s) => (s._type === "span" ? s.text : "")).join("");
}

export function blocksToPlainText(blocks: PortableTextBlock[]): string {
  return blocks.map((b) => spansToPlainText(b.children)).join("\n");
}
