import { getBaseUrl } from "@/shared/lib/constants";

const BASE_URL = getBaseUrl();

export const DEFAULT_ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /reservation/
Disallow: /_next/
Disallow: /static/

User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

Sitemap: ${BASE_URL}/sitemap.xml
Host: ${BASE_URL}`;

export function checkRobotsTxtWarnings(content: string): string[] {
  const warnings: string[] = [];
  const lines = content.split("\n").map((line) => line.trim().toLowerCase());

  let hasWildcardUserAgent = false;
  for (const line of lines) {
    if (line.startsWith("user-agent:") && line.includes("*")) {
      hasWildcardUserAgent = true;
    }
    if (hasWildcardUserAgent && line === "disallow: /") {
      warnings.push("この設定はサイト全体が検索結果から除外されます");
      break;
    }
  }

  if (!lines.some((line) => line.startsWith("sitemap:"))) {
    warnings.push("Sitemapが指定されていません（推奨）");
  }

  return warnings;
}
