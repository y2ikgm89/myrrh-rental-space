"use server";

import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { assertAdminFeatureCreateAllowed } from "@/shared/domain/features/check";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import type { BulkFaqItemResult } from "@/shared/domain/faq/types";
import {
  createFaqCategory as createFaqCategoryCommand,
  deleteFaqCategory as deleteFaqCategoryCommand,
  permanentlyDeleteFaqCategory as permanentlyDeleteFaqCategoryCommand,
  reorderFaqCategories as reorderFaqCategoriesCommand,
  restoreFaqCategory as restoreFaqCategoryCommand,
  updateFaqCategory as updateFaqCategoryCommand,
  updateFaqCategoryActive as updateFaqCategoryActiveCommand,
} from "@/shared/domain/faq/category-commands";
import {
  bulkDeleteFaqItems as bulkDeleteFaqItemsCommand,
  bulkMoveFaqItems as bulkMoveFaqItemsCommand,
  bulkPublishFaqItems as bulkPublishFaqItemsCommand,
} from "@/shared/domain/faq/item-bulk-commands";
import {
  createFaqItem as createFaqItemCommand,
  deleteFaqItem as deleteFaqItemCommand,
  permanentlyDeleteFaqItem as permanentlyDeleteFaqItemCommand,
  reorderFaqItems as reorderFaqItemsCommand,
  restoreFaqItem as restoreFaqItemCommand,
  updateFaqItem as updateFaqItemCommand,
  updateFaqItemPublished as updateFaqItemPublishedCommand,
} from "@/shared/domain/faq/item-commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import { invalidateSiteWideCache, firePurgeAsync } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  bulkFaqItemIdsSchema,
  bulkMoveFaqItemsSchema,
  faqCategoryFormSchema,
  faqItemFormSchema,
} from "@/admin/lib/validations/faq";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("FAQ");
const orderedIdsSchema = z
  .array(z.uuid({ error: "IDが不正です" }))
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じIDを複数指定することはできません",
  });
const faqItemOrderSchema = z
  .array(
    z.strictObject({
      id: z.uuid({ error: "IDが不正です" }),
      order: z.number().int().min(0, { error: "並び順が不正です" }),
    }),
  )
  .refine(
    (items) => new Set(items.map((item) => item.id)).size === items.length,
    {
      error: "同じIDを複数指定することはできません",
    },
  )
  .refine(
    (items) => new Set(items.map((item) => item.order)).size === items.length,
    {
      error: "同じ並び順を複数指定することはできません",
    },
  );

// CACHE-INVALIDATE-04: `invalidateSiteWideCache(CACHE_TAGS.FAQ)` は内部で
// updateTag と CDN queueTagPurge を一括発火する。以前ここに存在した
// `invalidateFaqCaches`（raw `updateTag` 呼び出し）は同一タグへの二重発火だったため削除。
function purgeFaqCaches(): void {
  invalidateSiteWideCache(CACHE_TAGS.FAQ);
  void firePurgeAsync(() => purgeCloudflareDetailUrls(["/faq"]), {
    operation: "purgeFaqList",
    urls: ["/faq"],
  });
}

export async function createFaqCategory(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    faqCategoryFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "faq",
        action: "create",
        execute: async () => {
          await assertAdminFeatureCreateAllowed("faq");
          return createFaqCategoryCommand({
            name: data.name,
            slug: data.slug,
            description: data.description ? data.description : null,
            icon: data.icon ? data.icon : null,
            isActive: data.isActive,
          });
        },
        afterSuccess: () => {
          purgeFaqCaches();
        },
        resolveAuditResourceId: (created) => created.id,
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateFaqCategory(
  categoryId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    faqCategoryFormSchema,
    async (data) => {
      const idValid = idSchema.safeParse(categoryId);
      if (!idValid.success) {
        return { ok: false, error: "カテゴリIDが不正です" };
      }

      const result = await executeAdminMutationResult({
        resource: "faq",
        action: "update",
        resourceId: idValid.data,
        execute: async () => {
          await updateFaqCategoryCommand(idValid.data, {
            name: data.name,
            slug: data.slug,
            description: data.description ? data.description : null,
            icon: data.icon ? data.icon : null,
            isActive: data.isActive,
          });
          return null;
        },
        afterSuccess: () => {
          purgeFaqCaches();
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

export async function updateFaqCategoryActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult<{ id: string; isActive: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  const parsedActive = z.boolean().safeParse(isActive);
  if (!parsedActive.success) {
    return createValidationMutationError(parsedActive.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validated.data,
    execute: async () =>
      updateFaqCategoryActiveCommand(validated.data, parsedActive.data),
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function deleteFaqCategory(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteFaqCategoryCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function reorderFaqCategories(
  orderedIds: string[],
): Promise<MutationResult> {
  const parsed = orderedIdsSchema.safeParse(orderedIds);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    execute: async () => {
      await reorderFaqCategoriesCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function createFaqItem(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, faqItemFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "faq",
      action: "create",
      execute: async () => {
        await assertAdminFeatureCreateAllowed("faq");
        return createFaqItemCommand({
          categoryId: data.categoryId,
          question: data.question,
          answer: data.answer,
          isPublished: data.isPublished,
        });
      },
      afterSuccess: () => {
        purgeFaqCaches();
      },
      resolveAuditResourceId: (created) => created.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateFaqItem(
  itemId: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, faqItemFormSchema, async (data) => {
    const idValid = idSchema.safeParse(itemId);
    if (!idValid.success) {
      return { ok: false, error: "FAQ項目IDが不正です" };
    }

    const result = await executeAdminMutationResult({
      resource: "faq",
      action: "update",
      resourceId: idValid.data,
      execute: async () => {
        await updateFaqItemCommand(idValid.data, {
          categoryId: data.categoryId,
          question: data.question,
          answer: data.answer,
          isPublished: data.isPublished,
        });
        return null;
      },
      afterSuccess: () => {
        purgeFaqCaches();
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function deleteFaqItem(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteFaqItemCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function reorderFaqItems(
  categoryId: string,
  items: { id: string; order: number }[],
): Promise<MutationResult> {
  const validatedCategoryId = idSchema.safeParse(categoryId);
  if (!validatedCategoryId.success) {
    return createValidationMutationError(validatedCategoryId.error);
  }

  const parsed = faqItemOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validatedCategoryId.data,
    execute: async () => {
      await reorderFaqItemsCommand(validatedCategoryId.data, parsed.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function updateFaqItemPublished(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<{ isPublished: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validated.data,
    execute: async () =>
      updateFaqItemPublishedCommand(validated.data, isPublished),
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

// ============================================================================
// Bulk operations
// ============================================================================

/**
 * coupon/customer の bulk 系 (Cluster A / Round-5 Cluster P) と同型:
 * リクエストコンテキストを execute() 時点で一度だけ取得し、同一バルク操作内の
 * 全 per-id record に共有する。
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

export async function bulkPublishFaqItems(
  ids: string[],
  isPublished: boolean,
): Promise<MutationResult<BulkFaqItemResult>> {
  const parsed = bulkFaqItemIdsSchema.safeParse(ids);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkPublishFaqItemsCommand(parsed.data, isPublished);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      purgeFaqCaches();
      // Round-5 audit Finding #16: FAQ の bulk mutation は per-id audit を
      // 発行しておらず、どの項目がいつ誰の操作で公開/非公開・削除・移動された
      // か個別に追跡できなかった。coupon (Round-5 Cluster P) と同型のヘルパーで
      // 揃える。
      emitBulkAuditRecords({
        resource: "faq.isPublished",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.UPDATE,
          newValue: { isPublished },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

export async function bulkDeleteFaqItems(
  ids: string[],
): Promise<MutationResult<BulkFaqItemResult>> {
  const parsed = bulkFaqItemIdsSchema.safeParse(ids);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "delete",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkDeleteFaqItemsCommand(parsed.data);
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      purgeFaqCaches();
      emitBulkAuditRecords({
        resource: "faq",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.DELETE,
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

export async function bulkMoveFaqItems(input: {
  ids: string[];
  newCategoryId: string;
}): Promise<MutationResult<BulkFaqItemResult>> {
  const parsed = bulkMoveFaqItemsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    execute: async (user) => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const result = await bulkMoveFaqItemsCommand(
        parsed.data.ids,
        parsed.data.newCategoryId,
      );
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      purgeFaqCaches();
      emitBulkAuditRecords({
        resource: "faq.category",
        userId: outcome.actorUserId,
        records: outcome.affectedIds.map((id) => ({
          resourceId: id,
          action: AuditAction.UPDATE,
          newValue: { categoryId: parsed.data.newCategoryId },
        })),
        metadata: buildBulkAuditMetadata({
          ip: outcome.ip,
          userAgent: outcome.userAgent,
        }),
      });
    },
  });
}

// ============================================================================
// Restore / Permanent delete (Recycle Bin)
// ============================================================================

export async function restoreFaqCategory(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await restoreFaqCategoryCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function restoreFaqItem(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      await restoreFaqItemCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function permanentlyDeleteFaqCategory(
  id: string,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await permanentlyDeleteFaqCategoryCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}

export async function permanentlyDeleteFaqItem(
  id: string,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await permanentlyDeleteFaqItemCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      purgeFaqCaches();
    },
  });
}
