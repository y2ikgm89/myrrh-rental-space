"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkToggleActiveCouponsCommand,
  bulkDeleteCouponsCommand,
  type BulkToggleActiveCouponsResult,
  type BulkDeleteCouponsResult,
} from "@/shared/domain/coupons/bulk-commands";

/**
 * customer/bulk.ts の buildBulkAuditMetadata と同型: リクエストコンテキストを
 * execute() 時点で一度だけ取得し、同一バルク操作内の全 per-id record に
 * 共有する。
 */
function buildBulkAuditMetadata(args: {
  ip: string | null;
  userAgent: string | null;
}): Record<string, unknown> {
  return {
    channel: "admin",
    ...(args.ip !== null && { ip: args.ip }),
    ...(args.userAgent !== null && { userAgent: args.userAgent }),
  };
}

const bulkInputSchema = z.object({
  ids: z
    .array(z.uuid({ error: "クーポンIDが不正です" }))
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
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkToggleActiveCouponsCommand(
        parsed.data.ids,
        isActive,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateCouponCachesForIds(outcome.affectedIds);
      // Round-5 audit Finding #1: coupon bulk mutations は per-id audit を
      // 発行しておらず、どのクーポンがいつ誰の操作で有効/無効化・削除された
      // か個別に追跡できなかった (customer/space の bulk 系は Cluster A で
      // 既に対応済み)。同型のヘルパーで揃える。
      emitBulkAuditRecords({
        resource: "coupon.isActive",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.UPDATE,
          newValue: { isActive: outcome.isActive },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
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
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkDeleteCouponsCommand(parsed.data.ids);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateCouponCachesForIds(outcome.affectedIds);
      emitBulkAuditRecords({
        resource: "coupon",
        userId: outcome.actorUserId,
        records: outcome.deleted.map((c) => ({
          resourceId: c.id,
          action: AuditAction.DELETE,
          oldValue: { code: c.code, name: c.name },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}
