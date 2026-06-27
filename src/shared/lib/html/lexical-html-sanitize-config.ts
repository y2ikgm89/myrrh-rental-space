/**
 * Lexical 由来 HTML のサニタイズ許可属性 SSoT。
 *
 * Lexical ノード追加時の `exportDOM()` `data-*` / `aria-*` は glob で通るため、
 * 本ファイルの更新は通常不要（iframe 等の非 data 属性のみ DOMPURIFY_EXTRA に追加）。
 *
 * - 保存前: `sanitizeLexicalContentHtml`（sanitize-html）
 * - 公開表示: `SanitizedHtml`（DOMPurify `ALLOW_DATA_ATTR`）
 */

/** sanitize-html の `"*"` キー向け共通属性（公式 `data-*` glob パターン） */
export const LEXICAL_HTML_GLOBAL_ATTRIBUTES = [
  "class",
  "id",
  "role",
  "data-*",
  "aria-*",
] as const;

/** DOMPurify `ADD_ATTR` — glob 非対応の属性のみ */
export const LEXICAL_DOMPURIFY_EXTRA_ATTRIBUTES = [
  "allow",
  "allowfullscreen",
  "frameborder",
  "scrolling",
  "target",
  "rel",
  "loading",
] as const;
