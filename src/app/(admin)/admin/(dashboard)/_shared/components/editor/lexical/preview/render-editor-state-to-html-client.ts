/**
 * EditorState JSON → HTML（クライアント専用）
 *
 * @description
 * `MobileEditorFallback` 等で、未保存の `contentJson` を読み取り専用プレビューに反映する。
 * サーバー版 `headless-renderer.ts` と同等のノード／テーマを使い、`logError` は使わない（client 安全）。
 */

import { createHeadlessEditor } from "@lexical/headless";
import { $generateHtmlFromNodes } from "@lexical/html";
import { EDITOR_NODES } from "../config/nodes";
import { editorTheme } from "../theme";
import { logger } from "@/shared/lib/logger";

/**
 * Lexical の EditorState JSON 文字列から HTML を生成する。
 * 空文字・パース失敗時は空文字を返す。
 */
export function renderEditorStateJsonToHtmlClient(
  editorStateJson: string,
): string {
  const trimmed = editorStateJson.trim();
  if (trimmed === "") {
    return "";
  }

  try {
    const editor = createHeadlessEditor({
      namespace: "MobilePreviewHeadless",
      theme: editorTheme,
      nodes: [...EDITOR_NODES],
      onError: (error: Error) => {
        logger.error("Headless Lexical preview error", {
          error: error.message,
        });
      },
    });

    const editorState = editor.parseEditorState(trimmed);
    editor.setEditorState(editorState);
    let html = "";
    editor.getEditorState().read(() => {
      html = $generateHtmlFromNodes(editor, null);
    });
    return html;
  } catch (error) {
    logger.error("Failed to render editor JSON to HTML for mobile preview", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}
