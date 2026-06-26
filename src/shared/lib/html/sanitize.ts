import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * 規約・記事・お知らせ等の保存前 HTML を server-side で sanitize する SSoT。
 *
 * Lexical エディタ → client `renderEditorStateJsonToHtmlClient` で生成された
 * HTML をそのまま DB へ保存すると、エディタ側 XSS フィルタ漏れ / 古い保存値 /
 * 手動 import の汚染で `<script>` / `<iframe srcdoc>` / event handler 属性が
 * `TermsAgreement.contentSnapshot` 等に永続注入される。
 *
 * 公式: https://github.com/apostrophecms/sanitize-html
 *
 * Lexical の標準出力に必要なタグ・属性のみ allow し、それ以外は除去する。
 * Lexical 拡張で新タグを追加した際は本 allowlist を更新すること。
 */
const TERMS_ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "div",
  "span",
] as const;

const SAFE_URL_SCHEMES = ["http", "https", "mailto", "tel"] as const;

/**
 * 規約 / 記事 / お知らせ等の Lexical 由来 HTML を sanitize する。
 *
 * - script / iframe / object / embed / form / input / button は強制除去
 * - on* event handler 属性は強制除去
 * - href / src の URL scheme は http / https / mailto / tel のみ許可
 * - srcdoc / srcset 等の高リスク属性は除去 (img は src + alt + width + height のみ)
 * - style 属性は除去 (CSS injection 経由 XSS 防止・装飾は class で行う)
 */
export function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...TERMS_ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      "*": ["class", "id"],
    },
    allowedSchemes: [...SAFE_URL_SCHEMES],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const isExternal =
          typeof attribs["href"] === "string" &&
          /^https?:\/\//u.test(attribs["href"]);
        return {
          tagName,
          attribs: {
            ...attribs,
            ...(isExternal && {
              target: "_blank",
              rel: "noopener noreferrer",
            }),
          },
        };
      },
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}
