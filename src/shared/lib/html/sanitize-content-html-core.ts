import sanitizeHtml from "sanitize-html";
import { LEXICAL_HTML_GLOBAL_ATTRIBUTES } from "@/shared/lib/html/lexical-html-sanitize-config";

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
  "div",
  "span",
] as const;

const SAFE_URL_SCHEMES = ["http", "https", "mailto", "tel"] as const;

/**
 * Lexical 由来 HTML の sanitize 本体（server-only / scripts 共通）。
 */
export function sanitizeLexicalContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...LEXICAL_ALLOWED_TAGS],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      "*": [...LEXICAL_HTML_GLOBAL_ATTRIBUTES],
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
