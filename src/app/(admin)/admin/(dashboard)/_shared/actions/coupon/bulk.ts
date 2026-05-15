"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkToggleActiveCouponsCommand,
  bulkDeleteCouponsCommand,
  type BulkToggleActiveCouponsResult,
  type BulkDeleteCouponsResult,
} from "@/shared/domain/coupons/bulk-commands";

const bulkInputSchema = z.object({
  ids: z
    .array(z.string().uuid({ error: "クーポンIDが不正です" }))
    .min(1, { error: "1件以上選択してください" })
    .max(100, { error: "一度に処理できるのは100件までです" })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "重複したクーポンIDが含まれています",
    }),
});

function invalidateCouponCachesForIds(ids: string[]): void {
  updateTag(CACHE_TAGS.COUPONS);
  for (const id of ids) {
    updateTag(getCacheTag.coupons.detail(id));
  }
}

export async function bulkToggleActiveCoupons(
  ids: string[],
  isActive: boolean,
): Promise<MutationResult<BulkToggleActiveCouponsResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "coupon",
    action: "update",
    execute: async () =>
      bulkToggleActiveCouponsCommand(parsed.data.ids, isActive),
    afterSuccess: (data) => {
      invalidateCouponCachesForIds(data.affectedIds);
    },
  });
}

export async function bulkDeleteCoupons(
  ids: string[],
): Promise<MutationResult<BulkDeleteCouponsResult>> {
  const parsed = bulkInputSchema.safeParse({ ids });
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "coupon",
    action: "delete",
    execute: async () => bulkDeleteCouponsCommand(parsed.data.ids),
    afterSuccess: (data) => {
      invalidateCouponCachesForIds(data.affectedIds);
    },
  });
}
