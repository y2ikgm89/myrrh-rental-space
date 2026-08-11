import "server-only";

import {
  sanitizeLexicalContentHtml,
  sanitizeRawEmbedHtml,
} from "@/shared/lib/html/sanitize-content-html-core";

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

/**
 * 描画直前の sanitize（`SanitizedHtml` に渡す前に必ず通す）。
 *
 * 以前は client component の中で `isomorphic-dompurify` が担っていたが、それは
 * SSR で jsdom をリクエスト経路に引き込む。Next の require-hook 下の Bun では
 * jsdom のロードが必ず失敗し（`css-tree` の ESM が `createRequire(import.meta.url)`
 * を使うため）、本文が server-render されず SSR HTML から丸ごと消えていた。
 * sanitize は jsdom 非依存の `sanitize-html`（保存時と同じ実装）でサーバー側に寄せる。
 *
 * @param html Lexical 由来の保存済み HTML
 */
export function sanitizeRenderedContentHtml(html: string): string {
  return sanitizeLexicalContentHtml(html);
}

/**
 * CustomSection / EmbedSection の**管理者手書き生 HTML** を描画直前に sanitize する。
 * Lexical を通らないぶん許容タグが広い。詳細は `sanitizeRawEmbedHtml` の JSDoc。
 */
export function sanitizeRenderedRawEmbedHtml(html: string): string {
  return sanitizeRawEmbedHtml(html);
}
