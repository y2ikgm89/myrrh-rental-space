"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkDeleteInquiriesCommand,
  type BulkDeleteInquiriesResult,
} from "@/shared/domain/inquiries/bulk-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "お問い合わせIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" }),
});

function invalidateInquiryCachesForIds(ids: string[]): void {
  updateTag(CACHE_TAGS.INQUIRIES);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.inquiries.detail(id));
  }
}

export async function bulkDeleteInquiries(
  ids: string[],
): Promise<MutationResult<BulkDeleteInquiriesResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "delete",
    execute: async () => bulkDeleteInquiriesCommand(parsed.data.ids),
    afterSuccess: (data) => {
      invalidateInquiryCachesForIds(data.affectedIds);
    },
  });
}
