import "server-only";

import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { firePurgeAsync } from "@/shared/lib/cache/fire-purge";
import { purgeCloudflareCache } from "@/shared/lib/cloudflare";

export function revalidateMedia(...ids: string[]): void {
  updateTag(CACHE_TAGS.MEDIA);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.media.detail(id));
  }
}

export function purgeMediaUrls(urls: string[]): void {
  const unique = [...new Set(urls.filter((url) => url.length > 0))];
  if (unique.length === 0) return;

  void firePurgeAsync(() => purgeCloudflareCache(unique), {
    operation: "purgeMediaUrls",
    urls: unique,
  });
}

/** Cache tag invalidation + optional media CDN URL purge. */
export function finalizeMediaMutation(
  ids: string[],
  urls: string[] = [],
): void {
  revalidateMedia(...ids);
  purgeMediaUrls(urls);
}
