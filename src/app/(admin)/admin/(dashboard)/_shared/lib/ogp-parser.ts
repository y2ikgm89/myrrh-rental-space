// 純粋な文字列操作関数群（server-only 不要）

function extractMetaContent(html: string, property: string): string {
  // og:property or name attribute
  const ogRegex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${RegExp.escape(property)}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const ogMatch = html.match(ogRegex);
  if (ogMatch?.[1]) return ogMatch[1];

  // content first pattern
  const contentFirstRegex = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${RegExp.escape(property)}["']`,
    "i",
  );
  const contentFirstMatch = html.match(contentFirstRegex);
  if (contentFirstMatch?.[1]) return contentFirstMatch[1];

  return "";
}

export function extractTitle(html: string): string | null {
  // og:title
  const ogTitle = extractMetaContent(html, "og:title");
  if (ogTitle) return ogTitle;

  // twitter:title
  const twitterTitle = extractMetaContent(html, "twitter:title");
  if (twitterTitle) return twitterTitle;

  // <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();

  return null;
}

export function extractDescription(html: string): string | null {
  // og:description
  const ogDesc = extractMetaContent(html, "og:description");
  if (ogDesc) return ogDesc;

  // twitter:description
  const twitterDesc = extractMetaContent(html, "twitter:description");
  if (twitterDesc) return twitterDesc;

  // meta description
  const metaDesc = extractMetaContent(html, "description");
  if (metaDesc) return metaDesc;

  return null;
}

export function extractImage(html: string): string | null {
  // og:image
  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage) return ogImage;

  // twitter:image
  const twitterImage = extractMetaContent(html, "twitter:image");
  if (twitterImage) return twitterImage;

  return null;
}

export function extractSiteName(html: string): string | null {
  // og:site_name
  const ogSiteName = extractMetaContent(html, "og:site_name");
  if (ogSiteName) return ogSiteName;

  // application-name
  const appName = extractMetaContent(html, "application-name");
  if (appName) return appName;

  return null;
}

export function getFaviconUrl(baseUrl: string, html: string): string {
  const url = new URL(baseUrl);

  // Extract from link tags
  // icon
  const iconRegex =
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i;
  const iconMatch = html.match(iconRegex);
  if (iconMatch?.[1]) {
    const href = iconMatch[1];
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return `${url.protocol}${href}`;
    if (href.startsWith("/")) return `${url.origin}${href}`;
    return `${url.origin}/${href}`;
  }

  // href first pattern
  const hrefFirstRegex =
    /<link[^>]*href=["']([^"']*)["'][^>]*rel=["'](?:shortcut )?icon["']/i;
  const hrefFirstMatch = html.match(hrefFirstRegex);
  if (hrefFirstMatch?.[1]) {
    const href = hrefFirstMatch[1];
    if (href.startsWith("http")) return href;
    if (href.startsWith("//")) return `${url.protocol}${href}`;
    if (href.startsWith("/")) return `${url.origin}${href}`;
    return `${url.origin}/${href}`;
  }

  // Default favicon path
  return `${url.origin}/favicon.ico`;
}

export function resolveUrl(baseUrl: string, relativeUrl: string): string {
  if (!relativeUrl) return "";
  if (relativeUrl.startsWith("http")) return relativeUrl;

  const url = new URL(baseUrl);
  if (relativeUrl.startsWith("//")) return `${url.protocol}${relativeUrl}`;
  if (relativeUrl.startsWith("/")) return `${url.origin}${relativeUrl}`;
  return `${url.origin}/${relativeUrl}`;
}
