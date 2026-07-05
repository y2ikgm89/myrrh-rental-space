import { isRecord } from "@/shared/lib/serialize";

export type ManagedImageSrcConfig = {
  readonly publicMediaUrl?: string | null;
};

const EXPLICIT_MANAGED_IMAGE_KEYS = new Set([
  "src",
  "imageUrl",
  "mainImageUrl",
  "thumbnailUrl",
  "ogpImageUrl",
  "defaultOgpImageUrl",
  "faviconUrl",
  "headerLogoUrl",
  "footerLogoUrl",
  "backgroundImageUrl",
]);

const LEXICAL_MEDIA_NODE_TYPES = new Set([
  "image",
  "inline-image",
  "gallery-item",
  "cover",
  "testimonial-item",
  "audio",
  "file",
]);

function isLocalPublicPath(src: string): boolean {
  return src.startsWith("/") && !src.startsWith("//") && !src.includes("\\");
}

function parseHttpUrl(src: string): URL | null {
  try {
    const url = new URL(src);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

function isSameOrigin(url: URL, candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const allowed = parseHttpUrl(candidate);
  return allowed !== null && url.origin === allowed.origin;
}

export function isAllowedManagedImageSrc(
  src: string,
  config: ManagedImageSrcConfig = {},
): boolean {
  if (isLocalPublicPath(src)) return true;

  const url = parseHttpUrl(src);
  if (url === null) return false;

  return isSameOrigin(url, config.publicMediaUrl);
}

function isImageLikePathSegment(segment: string): boolean {
  const key = segment.toLowerCase();
  return (
    key.includes("image") ||
    key.includes("media") ||
    key.includes("gallery") ||
    key.includes("poster") ||
    key.includes("thumbnail") ||
    key.includes("logo") ||
    key.includes("favicon")
  );
}

function hasMediaObjectShape(record: Record<string, unknown>): boolean {
  return (
    typeof record["alt"] === "string" ||
    typeof record["altText"] === "string" ||
    typeof record["caption"] === "string" ||
    typeof record["mimeType"] === "string" ||
    typeof record["filename"] === "string" ||
    typeof record["width"] === "number" ||
    typeof record["height"] === "number"
  );
}

function isLexicalMediaRecord(record: Record<string, unknown>): boolean {
  const type = record["type"];
  return typeof type === "string" && LEXICAL_MEDIA_NODE_TYPES.has(type);
}

function shouldInspectManagedImageString(
  key: string,
  path: readonly string[],
  record: Record<string, unknown>,
): boolean {
  if (EXPLICIT_MANAGED_IMAGE_KEYS.has(key)) {
    if (key === "src") return isLexicalMediaRecord(record);
    return true;
  }

  if (key !== "url") {
    return false;
  }

  return hasMediaObjectShape(record) || path.some(isImageLikePathSegment);
}

function walkManagedImageSources(
  value: unknown,
  path: readonly string[],
  config: ManagedImageSrcConfig,
  found: Set<string>,
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walkManagedImageSources(item, [...path, String(index)], config, found);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      typeof child === "string" &&
      child.length > 0 &&
      shouldInspectManagedImageString(key, path, value) &&
      !isAllowedManagedImageSrc(child, config)
    ) {
      found.add(child);
    }

    walkManagedImageSources(child, [...path, key], config, found);
  }
}

export function collectDisallowedManagedImageSrcs(
  value: unknown,
  config: ManagedImageSrcConfig = {},
): string[] {
  const found = new Set<string>();
  walkManagedImageSources(value, [], config, found);
  return Array.from(found);
}
