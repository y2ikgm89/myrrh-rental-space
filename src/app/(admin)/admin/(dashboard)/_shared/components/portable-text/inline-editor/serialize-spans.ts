/**
 * contenteditable DOM ↔ PortableTextSpan[] 双方向変換 pure helpers
 *
 * - serializeNodes: 子 Node を順走査し、text node は span token、
 *   `[data-portable-icon]` span は iconInline token として配列を返す
 * - applySpans: spans 配列から root の childNodes を再構築する
 *
 * iconInline span の DOM 表現:
 *   <span data-portable-icon="IconArrowRight" data-portable-key="<uuid>"
 *         data-portable-type="iconInline" contenteditable="false"
 *         role="img" aria-label="...">[chip visual]</span>
 *
 * `_key` は Sanity Portable Text 公式準拠の per-span 一意 ID。
 * apply 時に DOM の `data-portable-key` 属性に書き出し、serialize 時に復元する。
 * 新規 span（chip 削除等で生まれる）の `_key` はその場で `crypto.randomUUID()` 生成。
 */

import {
  createInlineIcon,
  createSpan,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

const KEY_DATA_ATTR = "data-portable-key";
const SPAN_TYPE_ATTR = "data-portable-type";
const ICON_NAME_ATTR = "data-portable-icon";

const ICON_CHIP_CLASS_NAME =
  "inline-flex items-center justify-center mx-0.5 rounded-sm border border-border bg-muted/40 px-1 py-0.5 text-xs font-mono text-foreground select-none cursor-default";

export function serializeNodes(root: HTMLElement): PortableTextSpan[] {
  const spans: PortableTextSpan[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const text = node.textContent ?? "";
      if (text.length === 0) continue;
      const last = spans[spans.length - 1];
      if (last && last._type === "span") {
        spans[spans.length - 1] = {
          ...last,
          text: last.text + text,
        };
      } else {
        spans.push(createSpan(text));
      }
      continue;
    }
    if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const el = node as HTMLElement;
      const iconName = el.getAttribute(ICON_NAME_ATTR);
      if (iconName !== null && iconName.length > 0) {
        const persistedKey = el.getAttribute(KEY_DATA_ATTR);
        spans.push(
          persistedKey !== null && persistedKey.length > 0
            ? { _key: persistedKey, _type: "iconInline", name: iconName }
            : createInlineIcon(iconName),
        );
      }
    }
  }
  return spans;
}

export function applySpans(
  root: HTMLElement,
  spans: PortableTextSpan[],
  doc: Document,
): void {
  while (root.firstChild) root.removeChild(root.firstChild);
  for (const span of spans) {
    if (span._type === "span") {
      root.appendChild(doc.createTextNode(span.text));
    } else {
      const el = doc.createElement("span");
      el.setAttribute(ICON_NAME_ATTR, span.name);
      el.setAttribute(KEY_DATA_ATTR, span._key);
      el.setAttribute(SPAN_TYPE_ATTR, "iconInline");
      el.setAttribute("contenteditable", "false");
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", span.name);
      el.className = ICON_CHIP_CLASS_NAME;
      el.textContent = span.name;
      root.appendChild(el);
    }
  }
}

export { KEY_DATA_ATTR, SPAN_TYPE_ATTR, ICON_NAME_ATTR, ICON_CHIP_CLASS_NAME };
