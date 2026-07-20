import sanitizeHtml from "sanitize-html";
import {
  LEXICAL_ALLOWED_IFRAME_HOSTNAMES,
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
  "abbr",
  ...LEXICAL_CURATED_ICON_SVG_TAGS,
] as const;

const SAFE_URL_SCHEMES = ["http", "https", "mailto", "tel"] as const;

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
      iframe: [...IFRAME_ATTRIBUTES],
      audio: ["src", "controls", "preload"],
      ...LEXICAL_CURATED_ICON_SVG_ATTRIBUTES,
      "*": [...LEXICAL_HTML_GLOBAL_ATTRIBUTES],
    },
    allowedSchemes: [...SAFE_URL_SCHEMES],
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
    },
    disallowedTagsMode: "discard",
    enforceHtmlBoundary: true,
  });
}
