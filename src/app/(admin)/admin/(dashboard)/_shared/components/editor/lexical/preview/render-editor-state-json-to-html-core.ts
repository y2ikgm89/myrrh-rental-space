import { withDOM } from "@lexical/headless/dom";
import { $generateHtmlFromNodes } from "@lexical/html";
import { createProjectHeadlessEditor } from "../create-headless-lexical-editor";
import { logger } from "@/shared/lib/errors/logger-core";
import { getErrorMessage } from "@/shared/lib/errors/server";

/**
 * Lexical EditorState JSON → HTML（環境非依存コア）。
 *
 * 公式: `createHeadlessEditor` + `withDOM` + `$generateHtmlFromNodes(editor, null)`。
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
      const editor = createProjectHeadlessEditor();
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
      error: getErrorMessage(error),
    });
    return "";
  }
}
