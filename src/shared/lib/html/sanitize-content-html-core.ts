import sanitizeHtml from "sanitize-html";
import {
  LEXICAL_ALLOWED_IFRAME_HOSTNAMES,
  LEXICAL_ALLOWED_URL_SCHEMES,
  LEXICAL_CURATED_ICON_SVG_ATTRIBUTES,
  LEXICAL_CURATED_ICON_SVG_TAGS,
  LEXICAL_HTML_GLOBAL_ATTRIBUTES,
} from "@/shared/lib/html/lexical-html-sanitize-config";

const LEXICAL_ALLOWED_TAGS = [
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
  "colgroup",
  "col",
  "div",
  "span",
  "figure",
  "figcaption",
  "details",
  "summary",
  "ruby",
  "rt",
  "iframe",
  "audio",
  "button",
  "sub",
  "sup",
  "abbr",
  ...LEXICAL_CURATED_ICON_SVG_TAGS,
] as const;

/**
 * iframe 属性は 7 種の埋め込み node（YouTube/Vimeo/Spotify/Figma/Instagram/X/MapEmbed）の
 * 和集合。ホスト名は `allowedIframeHostnames` で別途制限する。
 */
const IFRAME_ATTRIBUTES = [
  "src",
  "title",
  "allow",
  "allowfullscreen",
  "loading",
  "scrolling",
  "referrerpolicy",
] as const;

/**
 * Lexical 由来 HTML の sanitize 本体（server-only / scripts 共通）。
 */
export function sanitizeLexicalContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...LEXICAL_ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "title", "target", "rel", "download"],
      img: ["src", "alt", "width", "height", "loading", "style"],
      div: ["style"],
      span: ["style"],
      table: ["style"],
      tr: ["style"],
      th: ["style", "colspan", "rowspan"],
      td: ["style", "colspan", "rowspan"],
      col: ["style"],
      details: ["open"],
      abbr: ["tabindex"],
      button: ["type"],
      iframe: [...IFRAME_ATTRIBUTES],
      audio: ["src", "controls", "preload"],
      ...LEXICAL_CURATED_ICON_SVG_ATTRIBUTES,
      "*": [...LEXICAL_HTML_GLOBAL_ATTRIBUTES],
    },
    allowedSchemes: [...LEXICAL_ALLOWED_URL_SCHEMES],
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowedIframeHostnames: [...LEXICAL_ALLOWED_IFRAME_HOSTNAMES],
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
      button: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          type: "button",
        },
      }),
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}

/**
 * CustomSection の `body` / EmbedSection の `embedCode` 用 sanitize。
 *
 * この 2 つだけは Lexical を通らない**管理者手書きの生 HTML** なので、Lexical 由来
 * HTML より広いタグを許す。基準は `sanitize-html` の既定 allowlist（公式が安全側の
 * ベースラインとして提供しているもの）＋ 埋め込みに要るメディア/対話タグ。
 *
 * 意図的に許していないもの: `form` / `input` / `select` / `textarea` などのフォーム
 * 部品、`style` 要素、`html` / `body` / `template` などの文書構造タグ。
 * いずれも section の本文としては成り立たず、公開ページに置く理由が無い。
 *
 * iframe は `allowedIframeHostnames` でホストを制限する。ホスト外の iframe は
 * `src` だけが剥がされて空要素が残るため、`exclusiveFilter` で要素ごと落とす
 * （空の iframe は枠だけが描画されてしまう）。
 *
 * 公式: https://github.com/apostrophecms/sanitize-html
 */
const RAW_EMBED_EXTRA_TAGS = [
  "img",
  "iframe",
  "audio",
  "video",
  "source",
  "picture",
  "track",
  "del",
  "ins",
  "details",
  "summary",
  "button",
  ...LEXICAL_CURATED_ICON_SVG_TAGS,
] as const;

export function sanitizeRawEmbedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      ...RAW_EMBED_EXTRA_TAGS,
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel", "download"],
      img: ["src", "srcset", "alt", "width", "height", "loading", "style"],
      source: ["src", "srcset", "type", "media", "sizes"],
      track: ["src", "kind", "srclang", "label", "default"],
      video: ["src", "poster", "controls", "preload", "width", "height"],
      audio: ["src", "controls", "preload"],
      div: ["style"],
      span: ["style"],
      table: ["style"],
      tr: ["style"],
      th: ["style", "colspan", "rowspan"],
      td: ["style", "colspan", "rowspan"],
      col: ["style"],
      details: ["open"],
      abbr: ["tabindex"],
      button: ["type", "disabled"],
      iframe: [...IFRAME_ATTRIBUTES],
      ...LEXICAL_CURATED_ICON_SVG_ATTRIBUTES,
      "*": [...LEXICAL_HTML_GLOBAL_ATTRIBUTES],
    },
    allowedSchemes: [...LEXICAL_ALLOWED_URL_SCHEMES],
    allowedSchemesAppliedToAttributes: ["href", "src", "srcset"],
    allowedIframeHostnames: [...LEXICAL_ALLOWED_IFRAME_HOSTNAMES],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === "iframe" && frame.attribs["src"] === undefined,
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}
