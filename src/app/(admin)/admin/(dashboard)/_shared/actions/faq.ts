"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createFaqCategory as createFaqCategoryCommand,
  createFaqItem as createFaqItemCommand,
  deleteFaqCategory as deleteFaqCategoryCommand,
  deleteFaqItem as deleteFaqItemCommand,
  reorderFaqCategories as reorderFaqCategoriesCommand,
  reorderFaqItems as reorderFaqItemsCommand,
  toggleFaqItemPublished as toggleFaqItemPublishedCommand,
  updateFaqCategory as updateFaqCategoryCommand,
  updateFaqItem as updateFaqItemCommand,
} from "@/shared/domain/faq/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeFaqCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  faqCategoryFormSchema,
  faqItemFormSchema,
  type FaqCategoryFormInput,
  type FaqItemFormInput,
} from "@/admin/lib/validations/faq";

export type {
  FaqCategoryFormInput,
  FaqItemFormInput,
} from "@/admin/lib/validations/faq";
export type {
  FaqCategoryListResult,
  FaqCategoryWithItems,
  FaqItemFilters,
  FaqItemListResult,
  FaqItemPagination,
  FaqItemWithCategory,
} from "@/shared/domain/faq/types";

const idSchema = z.string().uuid({ error: "IDが不正です" });
const orderedIdsSchema = z.array(z.string().uuid({ error: "IDが不正です" }));

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
    execute: async () => createFaqCategoryCommand(parsed.data),
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
      await updateFaqCategoryCommand(validatedId.data, parsed.data);
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

  const answerHtml = await renderEditorStateToHtmlLazy(parsed.data.answerJson);

  return executeAdminMutationResult({
    resource: "faq",
    action: "create",
    execute: async () =>
      createFaqItemCommand({
        ...parsed.data,
        answerHtml,
      }),
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

  const answerHtml = await renderEditorStateToHtmlLazy(parsed.data.answerJson);

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updateFaqItemCommand(validatedId.data, {
        ...parsed.data,
        answerHtml,
      });
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
