import "server-only";

import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import {
  invalidateSiteWideCache,
  purgeMarketingHomeTag,
  firePurgeAsync,
} from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";

// 呼び出し元（post/mutations.ts 等）が Promise<void> を前提に await するため async を
// 維持する。内部の Cloudflare purge は意図的な fire-and-forget（void firePurgeAsync、
// 詳細は fire-purge.ts）で await せず、関数本体に await は無い。
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

// 呼び出し元（taxonomy.ts / bulk.ts）が Promise<void> を前提に await するため async を
// 維持する。内部の Cloudflare purge は意図的な fire-and-forget（void firePurgeAsync）で
// await せず、関数本体に await は無い。
export async function purgePostArchive(): Promise<void> {
  void firePurgeAsync(() => purgeCloudflareDetailUrls([...POST_LISTING_URLS]), {
    operation: "purgePostArchive",
    urls: [...POST_LISTING_URLS],
  });
}

// 呼び出し元（bulk.ts / mutations.ts）が Promise<void> を前提に await するため async を
// 維持する。invalidateSiteWideCache / purgeMarketingHomeTag は同期処理、/feed.xml の
// Cloudflare purge は意図的な fire-and-forget（void firePurgeAsync）で、関数本体に
// await は無い。
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

// 呼び出し元（taxonomy.ts）が Promise<void> を前提に await する、または afterSuccess
// （Promise<void> | void）に渡されるため async を維持する。invalidateSiteWideCache /
// purgeMarketingHomeTag はいずれも同期処理のため関数本体に await は無い。
export async function invalidatePostCategoryCaches(): Promise<void> {
  invalidateSiteWideCache([
    CACHE_TAGS.POSTS,
    CACHE_TAGS.POST_CATEGORIES,
    CACHE_TAGS.SIDEBAR_DATA,
  ]);
  purgeMarketingHomeTag();
}

// 呼び出し元（taxonomy.ts）が Promise<void> を前提に await する、または afterSuccess
// （Promise<void> | void）に渡されるため async を維持する。invalidateSiteWideCache /
// purgeMarketingHomeTag はいずれも同期処理のため関数本体に await は無い。
export async function invalidatePostTagCaches(): Promise<void> {
  invalidateSiteWideCache([
    CACHE_TAGS.POSTS,
    CACHE_TAGS.POST_TAGS,
    CACHE_TAGS.SIDEBAR_DATA,
  ]);
  purgeMarketingHomeTag();
}
