"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createFaqCategory as createFaqCategoryCommand,
  deleteFaqCategory as deleteFaqCategoryCommand,
  permanentlyDeleteFaqCategory as permanentlyDeleteFaqCategoryCommand,
  reorderFaqCategories as reorderFaqCategoriesCommand,
  restoreFaqCategory as restoreFaqCategoryCommand,
  updateFaqCategory as updateFaqCategoryCommand,
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

const idSchema = z.uuid({ error: "IDが不正です" });
const orderedIdsSchema = z
  .array(z.uuid({ error: "IDが不正です" }))
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じIDを複数指定することはできません",
  });

function invalidateFaqCaches(): void {
  updateTag(CACHE_TAGS.FAQ);
}

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
        execute: async () =>
          createFaqCategoryCommand({
            name: data.name,
            slug: data.slug,
            description: data.description ? data.description : null,
            icon: data.icon ? data.icon : null,
            isActive: data.isActive,
          }),
        afterSuccess: () => {
          invalidateFaqCaches();
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
          invalidateFaqCaches();
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
      invalidateFaqCaches();
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
      invalidateFaqCaches();
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
      execute: async () =>
        createFaqItemCommand({
          categoryId: data.categoryId,
          question: data.question,
          answer: data.answer,
          isPublished: data.isPublished,
        }),
      afterSuccess: () => {
        invalidateFaqCaches();
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
        invalidateFaqCaches();
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
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function reorderFaqItems(
  categoryId: string,
  orderedIds: string[],
): Promise<MutationResult> {
  const validatedCategoryId = idSchema.safeParse(categoryId);
  if (!validatedCategoryId.success) {
    return createValidationMutationError(validatedCategoryId.error);
  }

  const parsed = orderedIdsSchema.safeParse(orderedIds);
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
      invalidateFaqCaches();
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
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

// ============================================================================
// Bulk operations
// ============================================================================

export async function bulkPublishFaqItems(
  ids: string[],
  isPublished: boolean,
): Promise<MutationResult<{ count: number }>> {
  const parsed = bulkFaqItemIdsSchema.safeParse(ids);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    execute: async () => bulkPublishFaqItemsCommand(parsed.data, isPublished),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function bulkDeleteFaqItems(
  ids: string[],
): Promise<MutationResult<{ count: number }>> {
  const parsed = bulkFaqItemIdsSchema.safeParse(ids);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "delete",
    execute: async () => bulkDeleteFaqItemsCommand(parsed.data),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function bulkMoveFaqItems(input: {
  ids: string[];
  newCategoryId: string;
}): Promise<MutationResult<{ count: number }>> {
  const parsed = bulkMoveFaqItemsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    execute: async () =>
      bulkMoveFaqItemsCommand(parsed.data.ids, parsed.data.newCategoryId),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
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
      invalidateFaqCaches();
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
      invalidateFaqCaches();
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
      invalidateFaqCaches();
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
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}
