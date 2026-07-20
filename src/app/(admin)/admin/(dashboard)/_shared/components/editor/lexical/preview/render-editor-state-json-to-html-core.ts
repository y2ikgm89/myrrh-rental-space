import { withDOM } from "@lexical/headless/dom";
import { $generateHtmlFromNodes } from "@lexical/html";
import { createProjectHeadlessEditor } from "../create-headless-lexical-editor";

/**
 * Lexical EditorState JSON → HTML（環境非依存コア）。
 *
 * 公式: `createHeadlessEditor` + `withDOM` + `$generateHtmlFromNodes(editor, null)`。
 *
 * 変換失敗（node type の rename/削除等で「Type not registered」等が起きるケース）は
 * 呼び出し元へそのまま throw する。silent に空文字列へフォールバックすると、編集者が
 * タイトルを直すだけの些細な保存でも本文全体が空文字列で persist され、公開ページが
 * blank 化する事故になるため（M critical）。エラーのログ記録・ユーザー向けメッセージ化は
 * 呼び出し元の `deriveLexicalContentHtmlFromJsonCore` の責務。
 */
export function renderEditorStateJsonToHtmlCore(
  editorStateJson: string,
): string {
  const trimmed = editorStateJson.trim();
  if (trimmed === "") {
    return "";
  }

  return withDOM(() => {
    const editor = createProjectHeadlessEditor();
    const editorState = editor.parseEditorState(trimmed);
    editor.setEditorState(editorState);
    let html = "";
    editor.read(() => {
      html = $generateHtmlFromNodes(editor, null);
    });
    return html;
  });
}
