/**
 * EditorState JSON → HTML（クライアント専用）
 *
 * @description
 * `MobileEditorFallback` 等で未保存の `contentJson` を読み取り専用プレビューに反映する。
 *
 * Lexical 0.44 公式 headless パターン (`withDOM`) を経由する:
 * browser 環境では既存 `window` を再利用するため no-op に近いが、SSR や workers での
 * 互換性を担保する。サーバー側 `headless-renderer.ts` と同じ initialization 経路で
 * 揃えることで、`$generateHtmlFromNodes` および `react-dom/server` (Button /
 * FeatureIconList / InlineIcon の `exportDOM` 内) が一貫した DOM コンテキストで動作する。
 */

import { createHeadlessEditor } from "@lexical/headless";
import { withDOM } from "@lexical/headless/dom";
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
    return withDOM(() => {
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
      editor.read(() => {
        html = $generateHtmlFromNodes(editor, null);
      });
      return html;
    });
  } catch (error) {
    logger.error("Failed to render editor JSON to HTML for mobile preview", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}
