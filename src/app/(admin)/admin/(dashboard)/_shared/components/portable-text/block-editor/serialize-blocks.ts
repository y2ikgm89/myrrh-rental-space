/**
 * contenteditable DOM ↔ PortableTextBlock[] 双方向変換 pure helpers
 *
 * - serializeBlocks: root の direct children `<p>` を walk して各 paragraph 内の
 *   text + iconInline span を `serializeNodes` で span 配列化、PortableTextBlock を組み立てる
 * - applyBlocks: blocks 配列から root の childNodes を `<p>` 要素として再構築
 *
 * Block (`<p>`) DOM 表現:
 *   <p data-portable-block-key="<uuid>">[children: text nodes + iconInline span chips]</p>
 *
 * `_key` は Sanity Portable Text 公式準拠の per-block 一意 ID。
 * apply 時に DOM `data-portable-block-key` 属性に書き出し、serialize 時に復元する。
 * 新規 block（Enter key で生まれる）の `_key` はその場で `crypto.randomUUID()` 生成。
 *
 * 既存 inline editor (`serialize-spans.ts`) と同じ contenteditable + DOM walker パターン。
 * Lexical 不使用 — 公式 Sanity Portable Text spec 互換の最小実装。
 */

import {
  createBlock,
  createSpan,
  type PortableTextBlock,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";
import {
  applySpans,
  serializeNodes,
  ICON_CHIP_CLASS_NAME,
  ICON_NAME_ATTR,
  KEY_DATA_ATTR,
  SPAN_TYPE_ATTR,
} from "../inline-editor/serialize-spans";

const BLOCK_KEY_DATA_ATTR = "data-portable-block-key";

export function serializeBlocks(root: HTMLElement): PortableTextBlock[] {
  const blocks: PortableTextBlock[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== 1 /* ELEMENT_NODE */) {
      // Stray text node directly in root → wrap as 1 block / 1 span
      if (node.nodeType === 3 /* TEXT_NODE */) {
        const text = node.textContent ?? "";
        if (text.length === 0) continue;
        blocks.push(createBlock([createSpan(text)]));
      }
      continue;
    }
    const el = node as HTMLElement;
    if (el.tagName !== "P") {
      // Stray non-<p> element: serialize its inline content as 1 block
      const children = serializeNodes(el);
      if (children.length === 0) continue;
      blocks.push(createBlock(children));
      continue;
    }
    const persistedKey = el.getAttribute(BLOCK_KEY_DATA_ATTR);
    const children: PortableTextSpan[] = serializeNodes(el);
    if (persistedKey !== null && persistedKey.length > 0) {
      blocks.push({
        _key: persistedKey,
        _type: "block",
        style: "normal",
        children,
      });
    } else {
      blocks.push(createBlock(children));
    }
  }
  return blocks;
}

export function applyBlocks(
  root: HTMLElement,
  blocks: PortableTextBlock[],
  doc: Document,
): void {
  while (root.firstChild) root.removeChild(root.firstChild);
  for (const block of blocks) {
    const p = doc.createElement("p");
    p.setAttribute(BLOCK_KEY_DATA_ATTR, block._key);
    applySpans(p, block.children, doc);
    // Empty paragraph: insert <br> so contenteditable shows a line
    if (p.childNodes.length === 0) {
      p.appendChild(doc.createElement("br"));
    }
    root.appendChild(p);
  }
  // Ensure at least one editable paragraph exists for cursor placement
  if (root.childNodes.length === 0) {
    const p = doc.createElement("p");
    p.appendChild(doc.createElement("br"));
    root.appendChild(p);
  }
}

export {
  BLOCK_KEY_DATA_ATTR,
  ICON_CHIP_CLASS_NAME,
  ICON_NAME_ATTR,
  KEY_DATA_ATTR,
  SPAN_TYPE_ATTR,
};
