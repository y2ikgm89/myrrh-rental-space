import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/shared/lib/constants";

const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "Applebot-Extended",
  "meta-externalagent",
  "Amazonbot",
  "CCBot",
  "Bytespider",
  "cohere-ai",
  "cohere-training-data-crawler",
];

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/mypage/",
          "/reservation/complete",
          "/reservation/cancel",
          "/events/cancel",
          "/login",
          "/preview/",
          "/_next/data/",
        ],
      },
      {
        userAgent: AI_TRAINING_CRAWLERS,
        disallow: "/",
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
