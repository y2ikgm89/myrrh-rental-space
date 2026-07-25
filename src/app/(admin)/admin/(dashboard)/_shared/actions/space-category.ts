"use server";

/**
 * SpaceCategory Server Actions
 *
 * `useActionState` 統合経路に clean break 移行。delete / order / active 系は
 * input ベース (table 経由) で残置。
 */

import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { assertAdminFeatureCreateAllowed } from "@/shared/lib/features/check";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
// CACHE-INVALIDATE-02: SPACE_CATEGORIES は cdn-cache-tags.ts で SPACE_CATEGORY に
// mapped され /spaces / /spaces/[slug] の CDN Cache-Tag に emit されるため、
// raw updateTag では Cloudflare edge に伝播せず (数時間の s-maxage の間)
// 旧カテゴリ名 / 並び順 / 公開状態が配信され続ける silent stale が発生する。
// invalidateSiteWideCache 経由で updateTag (Next.js Data Cache) + queueTagPurge
// (Cloudflare CDN) + Sitemap 自動 purge を一括発火する (SSoT: .claude/rules/caching.md)。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createSpaceCategory as createSpaceCategoryCommand,
  deleteSpaceCategory as deleteSpaceCategoryCommand,
  updateSpaceCategory as updateSpaceCategoryCommand,
  updateSpaceCategoryActive as updateSpaceCategoryActiveCommand,
  updateSpaceCategoryOrder as updateSpaceCategoryOrderCommand,
} from "@/shared/domain/space-categories/commands";
import { spaceCategoryFormSchema } from "@/shared/lib/validations/space-category";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("スペースカテゴリ");
const categoryOrderSchema = z
  .array(
    z.strictObject({
      id: z.uuid({ error: "カテゴリーIDが不正です" }),
      sortOrder: z.number().int().min(0, { error: "並び順が不正です" }),
    }),
  )
  .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
    error: "同じIDを複数指定することはできません",
  })
  .refine(
    (items) =>
      new Set(items.map((item) => item.sortOrder)).size === items.length,
    {
      error: "同じ並び順を複数指定することはできません",
    },
  );

export async function createSpaceCategory(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    spaceCategoryFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "spaceCategory",
        action: "create",
        execute: async () => {
          await assertAdminFeatureCreateAllowed("spaces");
          return createSpaceCategoryCommand(data);
        },
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.SPACE_CATEGORIES);
        },
        resolveAuditResourceId: (result) => result.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateSpaceCategory(
  categoryId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    spaceCategoryFormSchema,
    async (data) => {
      const idValid = idSchema.safeParse(categoryId);
      if (!idValid.success) {
        return { ok: false, error: "カテゴリーIDが不正です" };
      }
      const result = await executeAdminMutationResult({
        resource: "spaceCategory",
        action: "update",
        resourceId: idValid.data,
        execute: async () => updateSpaceCategoryCommand(idValid.data, data),
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.SPACE_CATEGORIES);
        },
        resolveAuditResourceId: (result) => result.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateSpaceCategoryOrder(
  items: { id: string; sortOrder: number }[],
): Promise<MutationResult<{ updated: number }>> {
  const parsed = categoryOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "spaceCategory",
    action: "update",
    execute: async () => updateSpaceCategoryOrderCommand(parsed.data),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.SPACE_CATEGORIES);
    },
  });
}

export async function deleteSpaceCategory(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "spaceCategory",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteSpaceCategoryCommand(validated.data),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.SPACE_CATEGORIES);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateSpaceCategoryActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "spaceCategory",
    action: "update",
    resourceId: validated.data,
    execute: async () =>
      updateSpaceCategoryActiveCommand(validated.data, isActive),
    afterSuccess: () => {
      invalidateSiteWideCache(CACHE_TAGS.SPACE_CATEGORIES);
    },
  });
}
