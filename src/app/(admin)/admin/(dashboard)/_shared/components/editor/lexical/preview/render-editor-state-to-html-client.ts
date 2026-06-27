/**
 * EditorState JSON → HTML（クライアント専用）
 *
 * @description
 * `MobileEditorFallback` 等で未保存の `contentJson` を読み取り専用プレビューに反映する。
 * 永続化時の HTML 派生は server 側 `renderEditorStateJsonToHtmlServer` が担当する。
 */

"use client";

import { renderEditorStateJsonToHtmlCore } from "./render-editor-state-json-to-html-core";

export function renderEditorStateJsonToHtmlClient(
  editorStateJson: string,
): string {
  return renderEditorStateJsonToHtmlCore(editorStateJson);
}
