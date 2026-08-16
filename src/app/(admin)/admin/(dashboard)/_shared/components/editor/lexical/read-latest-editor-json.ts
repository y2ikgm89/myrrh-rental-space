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
