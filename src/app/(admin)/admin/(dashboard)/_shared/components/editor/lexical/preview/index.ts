/**
 * Preview エクスポート
 *
 * 2026-05-11 architectural shift: server-side `renderEditorStateToHtml` を廃止。
 * Lexical の React + react-dom/server 依存は client でしか動かないため、HTML 生成は
 * 必ず client (browser) で行う設計に統一した。Server Action は事前に render 済みの
 * `contentHtml` を input で受け取るだけになる。
 */

export { renderEditorStateJsonToHtmlClient } from "./render-editor-state-to-html-client";
