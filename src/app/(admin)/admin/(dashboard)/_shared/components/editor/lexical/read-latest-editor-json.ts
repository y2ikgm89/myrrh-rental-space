import type { LexicalEditor } from "lexical";

/**
 * persist 用の EditorState JSON。
 *
 * Lexical 公式の保存経路は React の onChange snapshot ではなく
 * `editor.getEditorState()` を submit 時に読む
 * （https://lexical.dev/docs/concepts/editor-state）。
 * OnChangePlugin → setState は非同期なので、type 直後の Preview/Save が
 * stale な React state を書くと本文が欠ける。
 */
export function resolvePersistableEditorJson(options: {
  editor: LexicalEditor | null;
  reactJson: string;
}): string {
  const { editor, reactJson } = options;
  if (!editor) {
    return reactJson;
  }
  return JSON.stringify(editor.getEditorState().toJSON());
}

/**
 * conform が DOM（hidden input）から組み立てた FormData の対象フィールドを
 * persist 時点の live editor state で上書きする。hidden input は
 * hydration 前 / no-JS fallback として残す。
 */
export function applyPersistableEditorJson(
  formData: FormData,
  fieldName: string,
  options: { editor: LexicalEditor | null; reactJson: string },
): void {
  formData.set(fieldName, resolvePersistableEditorJson(options));
}
