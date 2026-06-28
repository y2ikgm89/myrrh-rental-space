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

export const CONTENT_EMBED_FRAME_ORIGINS: readonly string[] = [
  "https://www.youtube.com",
  "https://player.vimeo.com",
  "https://open.spotify.com",
  "https://www.figma.com",
  "https://www.instagram.com",
  "https://www.google.com",
];

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
