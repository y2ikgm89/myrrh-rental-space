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
  bulkTogglePublishedSpacesCommand,
  bulkDeleteSpacesCommand,
  type AffectedSpace,
  type BulkPublishResult,
  type BulkDeleteResult,
} from "@/shared/domain/spaces/bulk-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "スペースIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
});

function invalidateSpaceCachesForTargets(
  targets: ReadonlyArray<AffectedSpace>,
): void {
  invalidateSiteWideCache([
    CACHE_TAGS.SPACES,
    CACHE_TAGS.SPACE_CATEGORIES,
    CACHE_TAGS.LOCATIONS,
    CACHE_TAGS.REVIEWS,
  ]);

  const seenIds = new Set<string>();
  for (const t of targets) {
    if (seenIds.has(t.id)) continue;
    seenIds.add(t.id);
    updateTag(getCacheTag.reviews.space(t.id));
    updateTag(getCacheTag.reviews.stats(t.id));
  }

  const paths = [...new Set(targets.map((t) => `/spaces/${t.slug}`))];
  if (paths.length > 0) {
    void firePurgeAsync(() => purgeCloudflareDetailUrls(paths), {
      operation: "invalidateSpaceCachesForTargets.detailUrlPurge",
      urls: paths,
    });
  }

  purgeMarketingHomeTag();
}

export async function bulkTogglePublishedSpaces(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<BulkPublishResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "publish",
    execute: async () =>
      bulkTogglePublishedSpacesCommand(parsed.data.ids, publish),
    afterSuccess: (data) => {
      invalidateSpaceCachesForTargets(data.affected);
    },
  });
}

export async function bulkDeleteSpaces(
  ids: string[],
): Promise<MutationResult<BulkDeleteResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "space",
    action: "delete",
    execute: async () => bulkDeleteSpacesCommand(parsed.data.ids),
    afterSuccess: (data) => {
      invalidateSpaceCachesForTargets(data.affected);
    },
  });
}
