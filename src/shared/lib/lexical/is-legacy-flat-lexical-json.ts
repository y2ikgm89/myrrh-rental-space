/**
 * 旧 terms_initial_data migration が投入した「root 直下 paragraph 1 個 + 全文ベタ結合」
 * Lexical JSON を検出する。
 *
 * 本形式は Lexical エディタ・保存パイプラインと整合しないため、contentHtml からの
 * 再 import または data migration で置換する。
 */

import { isRecord } from "@/shared/lib/serialize";

type LexicalJsonNode = {
  readonly type?: string;
  readonly text?: string;
  readonly children?: readonly LexicalJsonNode[];
};

function isLexicalJsonNode(value: unknown): value is LexicalJsonNode {
  if (!isRecord(value)) return false;
  const type = value["type"];
  const text = value["text"];
  const children = value["children"];
  return (
    (type === undefined || typeof type === "string") &&
    (text === undefined || typeof text === "string") &&
    (children === undefined ||
      (Array.isArray(children) && children.every(isLexicalJsonNode)))
  );
}

function parseRootChildren(json: string): readonly LexicalJsonNode[] | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null || !("root" in parsed)) {
      return null;
    }
    const root: unknown = parsed.root;
    if (
      typeof root !== "object" ||
      root === null ||
      Array.isArray(root) ||
      !("children" in root)
    ) {
      return null;
    }
    const children: unknown = root.children;
    return Array.isArray(children) && children.every(isLexicalJsonNode)
      ? children
      : null;
  } catch {
    return null;
  }
}

function containsStructuredBlock(nodes: readonly LexicalJsonNode[]): boolean {
  for (const node of nodes) {
    const type = node.type ?? "";
    if (
      type === "heading" ||
      type === "list" ||
      type === "table" ||
      type === "callout" ||
      type === "horizontalrule"
    ) {
      return true;
    }
    if (node.children && containsStructuredBlock(node.children)) {
      return true;
    }
  }
  return false;
}

function isEmptyEditorDocument(children: readonly LexicalJsonNode[]): boolean {
  if (children.length !== 1 || children[0]?.type !== "paragraph") {
    return false;
  }
  const paragraphChildren = children[0].children ?? [];
  if (paragraphChildren.length === 0) {
    return true;
  }
  if (paragraphChildren.length === 1 && paragraphChildren[0]?.type === "text") {
    const text = paragraphChildren[0].text ?? "";
    return text.trim() === "";
  }
  return false;
}

/**
 * 単一 paragraph に全文がベタ結合された legacy JSON かどうか。
 */
export function isLegacyFlatLexicalJson(json: string): boolean {
  const children = parseRootChildren(json);
  if (children === null) {
    return true;
  }
  if (isEmptyEditorDocument(children)) {
    return false;
  }
  if (children.length !== 1) {
    return false;
  }
  const only = children[0];
  if (only?.type !== "paragraph") {
    return false;
  }
  return !containsStructuredBlock(children);
}
