import "server-only";

import { sanitizeLexicalContentHtml } from "@/shared/lib/html/sanitize-content-html-core";

/**
 * 規約・記事・お知らせ等の保存前 HTML を server-side で sanitize する SSoT。
 *
 * Lexical エディタ → server `renderEditorStateJsonToHtmlServer`（terms）または
 * client `renderEditorStateJsonToHtmlClient`（posts/news 等）で生成された
 * HTML をそのまま DB へ保存すると、エディタ側 XSS フィルタ漏れ / 古い保存値 /
 * 手動 import の汚染で `<script>` / `<iframe srcdoc>` / event handler 属性が
 * `TermsAgreement.contentSnapshot` 等に永続注入される。
 *
 * 公式: https://github.com/apostrophecms/sanitize-html
 *
 * 実装本体は `sanitize-content-html-core.ts`（scripts からも import 可）。
 */
export function sanitizeContentHtml(html: string): string {
  return sanitizeLexicalContentHtml(html);
}
