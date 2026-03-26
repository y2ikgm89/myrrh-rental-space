/**
 * Lexical EditorState JSON バリデーション
 *
 * @description JSON primary storage 用の Zod スキーマ
 *
 * Lexical の `EditorState.isEmpty()` は nodeMap が root のみ（ブロック子なし）のとき true となり、
 * `setEditorState` はその状態を拒否する。空の編集内容は **root の下に空段落 1 つ** を持つ JSON を正とする。
 */

import { z } from "zod";

/**
 * 空の編集内容（本文なし・空の段落 1 ブロック）
 *
 * `createEditor` + `root.append($createParagraphNode())` の `toJSON()` と同形。
 */
export const EMPTY_LEXICAL_EDITOR_STATE_JSON =
  '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

/**
 * LexicalComposer の `initialConfig.editorState` に渡せる JSON か（root にブロック子が少なくとも 1 つ）。
 * レガシー JSON を EMPTY に置き換えない。無効なら UI 側でマウントしない。
 */
export function isLexicalComposerReadyEditorStateJson(val: string): boolean {
  try {
    const parsed: unknown = JSON.parse(val);
    if (typeof parsed !== "object" || parsed === null || !("root" in parsed)) {
      return false;
    }
    const root: unknown = parsed.root;
    if (
      typeof root !== "object" ||
      root === null ||
      Array.isArray(root) ||
      !("children" in root)
    ) {
      return false;
    }
    return Array.isArray(root.children) && root.children.length > 0;
  } catch {
    return false;
  }
}

/**
 * Lexical EditorState JSON 文字列のバリデーション（保存・Server Action 用）
 */
export const lexicalJsonSchema = z
  .string()
  .refine((val) => isLexicalComposerReadyEditorStateJson(val), {
    error: "有効なLexical EditorState JSONではありません",
  });
