import { createHeadlessEditor } from "@lexical/headless";
import { withDOM } from "@lexical/headless/dom";
import { $generateHtmlFromNodes } from "@lexical/html";
import { HEADLESS_EDITOR_NODES } from "../config/headless-nodes";
import { editorTheme } from "../theme";
import { logger } from "@/shared/lib/logger";

/**
 * Lexical EditorState JSON → HTML（環境非依存コア）。
 *
 * 公式: `$generateHtmlFromNodes(editor, null)` + headless `withDOM`。
 * 呼び出し元で DOM が利用可能であること（browser または server で JSDOM 済み）。
 */
export function renderEditorStateJsonToHtmlCore(
  editorStateJson: string,
): string {
  const trimmed = editorStateJson.trim();
  if (trimmed === "") {
    return "";
  }

  try {
    return withDOM(() => {
      const editor = createHeadlessEditor({
        namespace: "LexicalHeadlessHtmlExport",
        theme: editorTheme,
        nodes: [...HEADLESS_EDITOR_NODES],
        onError: (error: Error) => {
          logger.error("Headless Lexical HTML export error", {
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
    logger.error("Failed to render editor JSON to HTML", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}
