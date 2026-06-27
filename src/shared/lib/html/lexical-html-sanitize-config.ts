/**
 * Lexical 由来 HTML のサニタイズ許可属性 SSoT。
 *
 * - 保存前: `sanitizeLexicalContentHtml`（sanitize-html）
 * - 公開表示: `SanitizedHtml`（DOMPurify）
 *
 * curation icon SVG は `enrichLexicalContentHtmlWithCuratedIcons` が Tabler 由来のみ注入。
 * 許可タグ/属性は厳格 allowlist（XSS 対策）。
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

/** Tabler curated icon SVG サブツリー（sanitize-html / DOMPurify 共通） */
export const LEXICAL_CURATED_ICON_SVG_TAGS = [
  "svg",
  "path",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "g",
] as const;

/** sanitize-html `allowedAttributes` — SVG 専用（Tabler 出力に限定） */
export const LEXICAL_CURATED_ICON_SVG_ATTRIBUTES: Readonly<
  Record<string, readonly string[]>
> = {
  svg: [
    "xmlns",
    "width",
    "height",
    "viewBox",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "class",
    "aria-hidden",
    "data-icon-svg",
  ],
  path: [
    "d",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
  ],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width"],
  rect: [
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "fill",
    "stroke",
    "stroke-width",
  ],
  g: ["fill", "stroke", "stroke-width"],
  line: ["x1", "y1", "x2", "y2", "stroke", "stroke-width"],
  polyline: ["points", "fill", "stroke", "stroke-width"],
  polygon: ["points", "fill", "stroke", "stroke-width"],
};

/** DOMPurify `ADD_ATTR` — SVG 属性（`ALLOW_DATA_ATTR` 非対応分） */
export const LEXICAL_DOMPURIFY_SVG_ATTRIBUTES = [
  "xmlns",
  "viewBox",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "d",
  "cx",
  "cy",
  "r",
  "x",
  "y",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "data-icon-svg",
] as const;
