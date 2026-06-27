/**
 * EditorState JSON → HTML（ブラウザ専用）
 *
 * 未保存プレビュー用。headless / withDOM ではなく browser DOM + createEditor。
 */

"use client";

import { $generateHtmlFromNodes } from "@lexical/html";
import { createEditor } from "lexical";
import { EDITOR_NODES } from "../config/nodes";
import { editorTheme } from "../theme";

export function renderEditorStateJsonToHtmlClient(
  editorStateJson: string,
): string {
  const trimmed = editorStateJson.trim();
  if (trimmed === "") {
    return "";
  }

  const editor = createEditor({
    namespace: "LexicalBrowserHtmlExport",
    theme: editorTheme,
    nodes: [...EDITOR_NODES],
    onError: () => {},
  });

  const editorState = editor.parseEditorState(trimmed);
  editor.setEditorState(editorState);
  let html = "";
  editor.read(() => {
    html = $generateHtmlFromNodes(editor, null);
  });
  return html;
}
