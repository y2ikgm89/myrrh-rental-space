/**
 * 管理画面スペース一覧など向けの説明文プレビュー（HTML / Lexical JSON の混入に耐える）
 */

import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

const MAX_DEFAULT = 80;

/**
 * Lexical の EditorState JSON らしい文字列か（厳密スキーマに通らないレガシー JSON も広く検出）
 */
function looksLikeLexicalEditorStateJson(value: string): boolean {
  const t = value.trim();
  if (!t.startsWith("{")) return false;
  try {
    const parsed: unknown = JSON.parse(t);
    if (typeof parsed !== "object" || parsed === null || !("root" in parsed)) {
      return false;
    }
    const root: unknown = parsed.root;
    if (typeof root !== "object" || root === null) return false;
    return (
      "type" in root &&
      root.type === "root" &&
      "children" in root &&
      Array.isArray(root.children)
    );
  } catch {
    return false;
  }
}

function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 一覧用の短い説明テキスト。Lexical JSON はラベル、HTML はタグ除去、短文は省略記号なし。
 */
export function spaceDescriptionListSnippet(
  description: string,
  maxLen = MAX_DEFAULT,
): string {
  const trimmed = description.trim();
  if (trimmed.length === 0) return "";

  if (
    lexicalJsonSchema.safeParse(trimmed).success ||
    looksLikeLexicalEditorStateJson(trimmed)
  ) {
    return "リッチテキスト（説明）";
  }

  const plain = stripHtmlToPlain(trimmed);
  if (plain.length === 0) return "";

  if (plain.length <= maxLen) {
    return plain;
  }

  return `${plain.slice(0, maxLen)}…`;
}
