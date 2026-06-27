import "server-only";

import { renderEditorStateJsonToHtmlCore } from "./render-editor-state-json-to-html-core";

/**
 * Server Actions / RSC 向け EditorState JSON → HTML。
 * DOM bootstrap は core 内 `withDOM` が担当。
 */
export function renderEditorStateJsonToHtmlServer(
  editorStateJson: string,
): string {
  return renderEditorStateJsonToHtmlCore(editorStateJson);
}
