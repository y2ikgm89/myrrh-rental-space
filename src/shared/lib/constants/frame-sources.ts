/**
 * Frame source allowlists.
 *
 * CSP `frame-src` and admin write-side section validation both consume these
 * values so persisted embed URLs cannot drift beyond the browser policy.
 */

export const APP_INTERNAL_FRAME_ORIGINS: readonly string[] = [
  "https://challenges.cloudflare.com",
  "https://js.stripe.com",
];

/**
 * 本文埋め込みが使う iframe origin。
 *
 * **`platform.twitter.com` を含める（監査 A-44）。** Lexical 側の allowlist は
 * X 埋め込みを通していたのにここに無く、保存は成功するのにブラウザが
 * 必ず `Refused to frame` でブロックしていた（管理画面プレビューも同じ CSP なので
 * 編集者は原因に気づけない）。
 */
export const CONTENT_EMBED_FRAME_ORIGINS: readonly string[] = [
  "https://www.youtube.com",
  "https://player.vimeo.com",
  "https://open.spotify.com",
  "https://www.figma.com",
  "https://www.instagram.com",
  "https://platform.twitter.com",
  "https://www.google.com",
];

/**
 * `CONTENT_EMBED_FRAME_ORIGINS` の hostname 集合。
 *
 * sanitize 側（`LEXICAL_ALLOWED_IFRAME_HOSTNAMES`）はこれを導出する。
 * 両方を手書きすると、今回のように片方だけが増えて
 * 「保存はできるがブラウザが必ずブロックする」埋め込みができる。
 */
export const CONTENT_EMBED_FRAME_HOSTNAMES: readonly string[] =
  CONTENT_EMBED_FRAME_ORIGINS.map((origin) => new URL(origin).hostname);

export const FRAME_SRC_DIRECTIVE_VALUES: readonly string[] = [
  "'self'",
  ...APP_INTERNAL_FRAME_ORIGINS,
  ...CONTENT_EMBED_FRAME_ORIGINS,
];

const contentEmbedFrameOriginSet = new Set(CONTENT_EMBED_FRAME_ORIGINS);

export function isAllowedContentEmbedUrl(value: string): boolean {
  if (value === "") return true;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username !== "" || url.password !== "") return false;
    return contentEmbedFrameOriginSet.has(url.origin);
  } catch {
    return false;
  }
}
