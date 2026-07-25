/**
 * Lexical EditorState JSON の「実質空本文」判定。
 *
 * 公開 gate（規約の isPublished: true など）で使う。posts/news 側に同等の
 * SSoT が無いため、EMPTY 定数 + 構造 walk の純関数としてここに置く。
 */

import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

/**
 * 構造だけの Lexical node type（本文コンテンツを持たない）。
 * これら以外の type（image / embed / table 等）や非空 text があれば「本文あり」。
 */
const LEXICAL_STRUCTURAL_NODE_TYPES = new Set([
  "root",
  "paragraph",
  "heading",
  "list",
  "listitem",
  "quote",
  "link",
  "autolink",
  "linebreak",
  "layout-container",
  "layout-item",
]);

function hasMeaningfulLexicalNode(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasMeaningfulLexicalNode);
  }

  const record = value as Record<string, unknown>;
  const type = record["type"];

  if (type === "text") {
    const text = record["text"];
    return typeof text === "string" && text.trim().length > 0;
  }

  if (typeof type === "string" && !LEXICAL_STRUCTURAL_NODE_TYPES.has(type)) {
    return true;
  }

  return Object.values(record).some(hasMeaningfulLexicalNode);
}

/**
 * Lexical EditorState JSON が実質空本文かどうか。
 *
 * - `EMPTY_LEXICAL_EDITOR_STATE_JSON` と一致
 * - または text が空で、画像等の非構造ノードも無い
 */
export function isEmptyLexicalEditorStateJson(json: string): boolean {
  if (json === EMPTY_LEXICAL_EDITOR_STATE_JSON) {
    return true;
  }

  try {
    const parsed: unknown = JSON.parse(json);
    return !hasMeaningfulLexicalNode(parsed);
  } catch {
    // 不正 JSON は「有効な本文なし」として扱う（別途 lexicalJsonSchema が弾く）
    return true;
  }
}
