import "server-only";

import { ensureLexicalDomEnvironment } from "../lexical-dom-environment.server";
import { renderEditorStateJsonToHtmlCore } from "./render-editor-state-json-to-html-core";

/**
 * Server Actions / RSC 向け EditorState JSON → HTML。
 *
 * Lexical 公式: contentJson を正本とし、永続化直前に server 側で HTML を派生する。
 */
export function renderEditorStateJsonToHtmlServer(
  editorStateJson: string,
): string {
  ensureLexicalDomEnvironment();
  return renderEditorStateJsonToHtmlCore(editorStateJson);
}
