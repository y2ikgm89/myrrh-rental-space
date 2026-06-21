"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import {
  invalidateSiteWideCache,
  purgeMarketingHomeTag,
  firePurgeAsync,
} from "@/shared/lib/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkTogglePublishedNewsCommand,
  bulkDeleteNewsCommand,
  type BulkPublishNewsResult,
  type BulkDeleteNewsResult,
} from "@/shared/domain/news/bulk-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "お知らせIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
});

function invalidateNewsCachesForSlugs(slugs: string[]): void {
  const uniqueSlugs = [...new Set(slugs)];
  for (const slug of uniqueSlugs) {
    updateTag(getCacheTag.news.detail(slug));
  }
  const paths = uniqueSlugs.map((s) => `/news/${s}`);
  if (paths.length > 0) {
    void firePurgeAsync(() => purgeCloudflareDetailUrls(paths), {
      operation: "purgeNewsDetailUrls.bulk",
      urls: paths,
    });
  }
  invalidateSiteWideCache([CACHE_TAGS.NEWS, CACHE_TAGS.SIDEBAR_DATA]);
  purgeMarketingHomeTag();
}

export async function bulkTogglePublishedNews(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishNewsResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "news",
    action: "publish",
    execute: async () =>
      bulkTogglePublishedNewsCommand(parsed.data.ids, publish),
    afterSuccess: (data) => {
      invalidateNewsCachesForSlugs(data.affectedSlugs);
    },
  });
}

export async function bulkDeleteNews(
  ids: string[],
): Promise<MutationResult<BulkDeleteNewsResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "news",
    action: "delete",
    execute: async () => bulkDeleteNewsCommand(parsed.data.ids),
    afterSuccess: (data) => {
      invalidateNewsCachesForSlugs(data.affectedSlugs);
    },
  });
}
