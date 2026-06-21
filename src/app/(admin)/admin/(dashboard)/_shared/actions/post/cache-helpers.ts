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

export async function purgePostArchive(): Promise<void> {
  void firePurgeAsync(() => purgeCloudflareDetailUrls(["/blog"]), {
    operation: "purgePostArchive",
    urls: ["/blog"],
  });
}

export async function invalidatePostCollectionCaches(): Promise<void> {
  invalidateSiteWideCache([CACHE_TAGS.POSTS, CACHE_TAGS.SIDEBAR_DATA]);
  purgeMarketingHomeTag();
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
