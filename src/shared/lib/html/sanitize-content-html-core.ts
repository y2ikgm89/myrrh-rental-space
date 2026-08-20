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
 * `style` 許可タグ向け CSS 制限。
 *
 * `allowedSchemes` は href/src（と raw embed の srcset）にしか効かない。
 * `background-image:url(...)` はスキーム検査対象外なので、ここで
 * `https?` / サイト相対の単一 `url()` だけを通す。`javascript:` / `data:` /
 * 二重 `url()` は値全体が不一致になり落ちる。
 *
 * プロパティは Lexical export と既存テストが実際に書くものに限定する。
 */
const CSS_LENGTH = /^\d+(?:\.\d+)?(?:px|%)$/u;
const CSS_COLOR = [
  /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu,
  /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/u,
  /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s*\)$/u,
  /^transparent$/iu,
  /^var\(--[a-zA-Z0-9_-]+\)$/u,
];
const CSS_SAFE_URL =
  /^url\(\s*(['"]?)(?:https?:\/\/|\/(?!\/))[^'"()\\\s]+\1\s*\)$/iu;
const CSS_FR_TRACKS = /^(?:\d+fr)(?:\s+\d+fr)*$/u;

const CONTENT_ALLOWED_STYLES = {
  "*": {
    width: [CSS_LENGTH],
    display: [/^block$/u],
    color: CSS_COLOR,
    "background-color": CSS_COLOR,
    "background-image": [CSS_SAFE_URL],
    "table-layout": [/^(?:fixed|auto)$/u],
    border: [/^\d+(?:\.\d+)?px\s+solid\s+(?:#[0-9a-f]{3,8}|[a-z]+)$/iu],
    "vertical-align": [/^(?:top|middle|bottom|baseline)$/u],
    "text-align": [/^(?:start|end|left|right|center)$/u],
    "grid-template-columns": [CSS_FR_TRACKS],
    "--lexical-layout-mobile": [CSS_FR_TRACKS],
    "--table-border-color": CSS_COLOR,
    "--table-border-width": [/^\d+(?:\.\d+)?px$/u],
    "--step-label": [/^(["'])[^"'\\]*\1$/u],
  },
};

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
    allowedStyles: CONTENT_ALLOWED_STYLES,
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
    allowedStyles: CONTENT_ALLOWED_STYLES,
    allowedIframeHostnames: [...LEXICAL_ALLOWED_IFRAME_HOSTNAMES],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === "iframe" && frame.attribs["src"] === undefined,
    transformTags: {
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
