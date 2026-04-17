"use server";

import { updateTag } from "next/cache";
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
  toggleFaqItemPublished as toggleFaqItemPublishedCommand,
  updateFaqItem as updateFaqItemCommand,
} from "@/shared/domain/faq/item-commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeFaqCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  bulkFaqItemIdsSchema,
  bulkMoveFaqItemsSchema,
  faqCategoryFormSchema,
  faqItemFormSchema,
  type FaqCategoryFormInput,
  type FaqItemFormInput,
} from "@/admin/lib/validations/faq";

const idSchema = z.string().uuid({ error: "IDが不正です" });
const orderedIdsSchema = z
  .array(z.string().uuid({ error: "IDが不正です" }))
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じIDを複数指定することはできません",
  });

function invalidateFaqCaches(): void {
  updateTag(CACHE_TAGS.FAQ);
}

function purgeFaqCaches(): void {
  fireAndForget(purgeFaqCache(), {
    operation: "purgeFaqCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function createFaqCategory(
  data: FaqCategoryFormInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = faqCategoryFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "create",
    execute: async () => createFaqCategoryCommand(omitUndefined(parsed.data)),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateFaqCategory(
  id: string,
  data: FaqCategoryFormInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = faqCategoryFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateFaqCategoryCommand(
        validatedId.data,
        omitUndefined(parsed.data),
      );
      return null;
    },
    afterSuccess: () => {
      invalidateFaqCaches();
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
  data: FaqItemFormInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = faqItemFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "create",
    execute: async () => createFaqItemCommand(omitUndefined(parsed.data)),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateFaqItem(
  id: string,
  data: FaqItemFormInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = faqItemFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateFaqItemCommand(validatedId.data, omitUndefined(parsed.data));
      return null;
    },
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
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

export async function toggleFaqItemPublished(
  id: string,
): Promise<MutationResult<{ isPublished: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validated.data,
    execute: async () => toggleFaqItemPublishedCommand(validated.data),
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
