import { getBaseUrl } from '@/shared/lib/constants'

const BASE_URL = getBaseUrl()

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
Host: ${BASE_URL}`
