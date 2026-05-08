/**
 * contenteditable DOM ↔ ButtonLabelToken[] 双方向変換 pure helpers
 *
 * - serializeNodes: 子 Node を順走査し、text node は text token、
 *   `[data-icon]` span は icon token として token 配列を返す
 * - applyTokens: token 配列から root の childNodes を再構築する
 *
 * icon span の DOM 表現:
 *   <span data-icon="IconArrowRight" contenteditable="false" role="img" aria-label="...">[chip visual]</span>
 */

import type { ButtonLabelToken } from "@/shared/lib/sections/definitions/_shared/button-label";

const ICON_DATA_ATTR = "data-icon";

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
        tokens[tokens.length - 1] = { type: "text", value: last.value + value };
      } else {
        tokens.push({ type: "text", value });
      }
      continue;
    }
    if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const el = node as HTMLElement;
      const iconName = el.getAttribute(ICON_DATA_ATTR);
      if (iconName !== null && iconName.length > 0) {
        tokens.push({ type: "icon", name: iconName });
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
      span.setAttribute("contenteditable", "false");
      span.setAttribute("role", "img");
      span.setAttribute("aria-label", token.name);
      span.className = ICON_CHIP_CLASS_NAME;
      span.textContent = token.name;
      root.appendChild(span);
    }
  }
}

export { ICON_DATA_ATTR, ICON_CHIP_CLASS_NAME };
