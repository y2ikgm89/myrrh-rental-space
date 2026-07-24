import "server-only";

import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import {
  invalidateSiteWideCache,
  purgeMarketingHomeTag,
  firePurgeAsync,
} from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";

export async function purgePostCaches(
  ...slugs: Array<string | undefined>
): Promise<void> {
  const unique = [...new Set(slugs.filter((s): s is string => Boolean(s)))].map(
    (s) => `/blog/${s}`,
  );
  if (unique.length === 0) return;
  void firePurgeAsync(() => purgeCloudflareDetailUrls(unique), {
    operation: "purgePostDetailUrls",
    urls: unique,
  });
}

const POST_LISTING_URLS = ["/blog", "/feed.xml"] as const;

export async function purgePostArchive(): Promise<void> {
  void firePurgeAsync(() => purgeCloudflareDetailUrls([...POST_LISTING_URLS]), {
    operation: "purgePostArchive",
    urls: [...POST_LISTING_URLS],
  });
}

export async function invalidatePostCollectionCaches(): Promise<void> {
  invalidateSiteWideCache([CACHE_TAGS.POSTS, CACHE_TAGS.SIDEBAR_DATA]);
  purgeMarketingHomeTag();
  // /feed.xml は Cache-Tag を emit しない。記事 CRUD は purgePostArchive を呼ばないため
  // ここで RSS feed の URL purge も併発する (/blog は POST tag + site-wide co-purge で足りる)。
  void firePurgeAsync(() => purgeCloudflareDetailUrls(["/feed.xml"]), {
    operation: "purgePostFeed",
    urls: ["/feed.xml"],
  });
}

export async function invalidatePostCategoryCaches(): Promise<void> {
  invalidateSiteWideCache([
    CACHE_TAGS.POSTS,
    CACHE_TAGS.POST_CATEGORIES,
    CACHE_TAGS.SIDEBAR_DATA,
  ]);
  purgeMarketingHomeTag();
}

export async function invalidatePostTagCaches(): Promise<void> {
  invalidateSiteWideCache([
    CACHE_TAGS.POSTS,
    CACHE_TAGS.POST_TAGS,
    CACHE_TAGS.SIDEBAR_DATA,
  ]);
  purgeMarketingHomeTag();
}
