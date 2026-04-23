export function getContentPreviewHref(
  basePath: string,
  identifier: string,
): string {
  const previewSlug = identifier || "preview-new";
  return `${basePath}/preview/${previewSlug}`;
}

export function getPagePreviewHref(slug: string): string {
  return `/preview/pages/${slug || "home"}`;
}

export function getPublicPageHref(slug: string): string {
  return slug === "home" ? "/" : `/${slug}`;
}
