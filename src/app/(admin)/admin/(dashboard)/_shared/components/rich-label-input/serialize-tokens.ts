/**
 * contenteditable DOM ↔ ButtonLabelToken[] 双方向変換 pure helpers
 *
 * - serializeNodes: 子 Node を順走査し、text node は text token、
 *   `[data-icon]` span は icon token として token 配列を返す
 * - applyTokens: token 配列から root の childNodes を再構築する
 *
 * icon span の DOM 表現:
 *   <span data-icon="IconArrowRight" data-key="<uuid>" contenteditable="false"
 *         role="img" aria-label="...">[chip visual]</span>
 *
 * `_key` は Sanity Portable Text 互換の per-token 一意 ID。
 * apply 時に DOM の `data-key` 属性に書き出し、serialize 時に復元する。
 * 新規 text segment（chip 削除等で生まれる）の `_key` はその場で `crypto.randomUUID()` 生成。
 */

import {
  createIconToken,
  createTextToken,
  type ButtonLabelToken,
} from "@/shared/lib/sections/definitions/_shared/button-label";

const ICON_DATA_ATTR = "data-icon";
const KEY_DATA_ATTR = "data-key";

const ICON_CHIP_CLASS_NAME =
  "inline-flex items-center justify-center mx-0.5 rounded-sm border border-border bg-muted/40 px-1 py-0.5 text-xs font-mono text-foreground select-none cursor-default";

export function serializeNodes(root: HTMLElement): ButtonLabelToken[] {
  const tokens: ButtonLabelToken[] = [];
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const value = node.textContent ?? "";
      if (value.length === 0) continue;
      const last = tokens[tokens.length - 1];
      if (last && last.type === "text") {
        // 直前の text token と merge（既存 _key を維持）
        tokens[tokens.length - 1] = {
          ...last,
          value: last.value + value,
        };
      } else {
        tokens.push(createTextToken(value));
      }
      continue;
    }
    if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const el = node as HTMLElement;
      const iconName = el.getAttribute(ICON_DATA_ATTR);
      if (iconName !== null && iconName.length > 0) {
        const persistedKey = el.getAttribute(KEY_DATA_ATTR);
        tokens.push(
          persistedKey !== null && persistedKey.length > 0
            ? { _key: persistedKey, type: "icon", name: iconName }
            : createIconToken(iconName),
        );
      }
    }
  }
  return tokens;
}

export function applyTokens(
  root: HTMLElement,
  tokens: ButtonLabelToken[],
  doc: Document,
): void {
  while (root.firstChild) root.removeChild(root.firstChild);
  for (const token of tokens) {
    if (token.type === "text") {
      root.appendChild(doc.createTextNode(token.value));
    } else {
      const span = doc.createElement("span");
      span.setAttribute(ICON_DATA_ATTR, token.name);
      span.setAttribute(KEY_DATA_ATTR, token._key);
      span.setAttribute("contenteditable", "false");
      span.setAttribute("role", "img");
      span.setAttribute("aria-label", token.name);
      span.className = ICON_CHIP_CLASS_NAME;
      span.textContent = token.name;
      root.appendChild(span);
    }
  }
}

export { ICON_DATA_ATTR, KEY_DATA_ATTR, ICON_CHIP_CLASS_NAME };
