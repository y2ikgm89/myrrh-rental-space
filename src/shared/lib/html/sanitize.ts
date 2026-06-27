import "server-only";

import { sanitizeLexicalContentHtml } from "@/shared/lib/html/sanitize-content-html-core";

/**
 * 規約・記事・お知らせ等の保存前 HTML を server-side で sanitize する SSoT。
 *
 * Lexical エディタ → server `deriveLexicalContentHtmlFromJson`（terms / posts / news 等）で
 * contentJson から HTML を派生。client 送信 HTML は使用しない。
 *
 * 公式: https://github.com/apostrophecms/sanitize-html
 *
 * 実装本体は `sanitize-content-html-core.ts`（scripts からも import 可）。
 */
export function sanitizeContentHtml(html: string): string {
  return sanitizeLexicalContentHtml(html);
}
