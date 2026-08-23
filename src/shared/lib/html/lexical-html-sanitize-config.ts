/**
 * Lexical 由来 HTML のサニタイズ許可属性 SSoT。
 *
 * - 保存前: `sanitizeLexicalContentHtml`（sanitize-html）
 * - 公開表示: `SanitizedHtml`（DOMPurify）
 *
 * curation icon SVG は `enrichLexicalContentHtmlWithCuratedIcons` が Tabler 由来のみ注入。
 * 許可タグ/属性は厳格 allowlist（XSS 対策）。
 */

import { CONTENT_EMBED_FRAME_HOSTNAMES } from "@/shared/lib/constants/frame-sources";

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
  "referrerpolicy",
] as const;

/**
 * Lexical の埋め込み系 node（YouTube / Vimeo / Spotify / Figma / Instagram / X / MapEmbed）
 * が生成する iframe の許可ホスト名 SSoT。
 *
 * - `sanitize-content-html-core.ts` の `allowedIframeHostnames`（保存時）
 * - 各 node の `importDOM`（ペースト取込時。Spotify/Figma/MapEmbed は保存済み URL を
 *   検証なしで読むため、ここでの再検証が唯一のガード）
 * の両方から参照する。
 *
 * **CSP の `frame-src` から導出する（監査 A-44）。** 以前は手書きの別リストで、
 * `platform.twitter.com` がここにだけあったため X 埋め込みは保存されるのに
 * ブラウザが必ずブロックしていた。埋め込み node を追加するときは
 * `CONTENT_EMBED_FRAME_ORIGINS` に追記する— そうすれば CSP と sanitize が同時に揃う。
 */
export const LEXICAL_ALLOWED_IFRAME_HOSTNAMES: readonly string[] =
  CONTENT_EMBED_FRAME_HOSTNAMES;

/** `LEXICAL_ALLOWED_IFRAME_HOSTNAMES` に含まれるホスト名かどうかを判定する */
export function isAllowedLexicalIframeHostname(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return LEXICAL_ALLOWED_IFRAME_HOSTNAMES.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Lexical 由来 URL 属性（`href` 等）の許可スキーム SSoT。
 *
 * - `sanitize-content-html-core.ts` の `allowedSchemes`（保存時）
 * - `sanitizeLexicalUrlScheme`（下記。ペースト取込時）
 * の両方から参照する。
 */
export const LEXICAL_ALLOWED_URL_SCHEMES: readonly string[] = [
  "http",
  "https",
  "mailto",
  "tel",
];

/**
 * URL のスキームを検証し、非許可スキーム（`javascript:` 等）なら `about:blank` へ
 * 強制変換する。相対パス（`/` `.` `#` 始まり）はスキームを持たないため常に許可する。
 *
 * `@lexical/link` の `LinkNode.sanitizeUrl` と同じ判定パターン。BookmarkNode /
 * ButtonNode / FileNode の importDOM は自ノードの marker 属性
 * （`data-bookmark` / `data-button` / `data-file`）を持つ任意の貼り付け HTML から
 * `href` を無検証で読むため、ここでの検証が admin エディタ内での唯一のガードになる
 * （保存時の sanitize-html はスキーム単位で再度弾くが、それ以前のエディタ内
 * decorator 描画・exportDOM 経路は本関数を経由しない限り無防備）。
 */
export function sanitizeLexicalUrlScheme(url: string): string {
  if (!url || /^[/.#]/.test(url)) return url;
  try {
    const scheme = new URL(url).protocol.replace(/:$/, "");
    if (!LEXICAL_ALLOWED_URL_SCHEMES.includes(scheme)) return "about:blank";
  } catch {
    return url;
  }
  return url;
}

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
