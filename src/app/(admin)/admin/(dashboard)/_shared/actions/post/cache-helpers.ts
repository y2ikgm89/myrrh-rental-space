"use server";

import { updateTag } from "next/cache";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgePostCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";

export async function purgePostCaches(
  ...slugs: Array<string | undefined>
): Promise<void> {
  const uniqueSlugs = [
    ...new Set(slugs.filter((slug): slug is string => Boolean(slug))),
  ];

  for (const slug of uniqueSlugs) {
    fireAndForget(purgePostCache(slug), {
      operation: "purgePostCache",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
    });
  }
}

export async function purgePostArchive(): Promise<void> {
  fireAndForget(purgePostCache(), {
    operation: "purgePostCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function invalidatePostCollectionCaches(): Promise<void> {
  updateTag(CACHE_TAGS.POSTS);
}

export async function invalidatePostCategoryCaches(): Promise<void> {
  updateTag(CACHE_TAGS.POSTS);
  updateTag(CACHE_TAGS.POST_CATEGORIES);
}

export async function invalidatePostTagCaches(): Promise<void> {
  updateTag(CACHE_TAGS.POSTS);
  updateTag(CACHE_TAGS.POST_TAGS);
}
