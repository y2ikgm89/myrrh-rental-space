"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeSpaceCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkTogglePublishedSpacesCommand,
  bulkDeleteSpacesCommand,
  type BulkPublishResult,
  type BulkDeleteResult,
} from "@/shared/domain/spaces/bulk-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "スペースIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
});

function invalidateSpaceCachesForIds(ids: string[]): void {
  updateTag(CACHE_TAGS.SPACES);
  updateTag(CACHE_TAGS.REVIEWS);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.spaces.detail(id));
    updateTag(getCacheTag.reviews.space(id));
    updateTag(getCacheTag.reviews.stats(id));
    fireAndForget(purgeSpaceCache(id), {
      operation: "purgeSpaceCache",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
    });
  }
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
      invalidateSpaceCachesForIds(data.affectedIds);
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
      invalidateSpaceCachesForIds(data.affectedIds);
    },
  });
}
