"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
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
import { createValidationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeFaqCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  faqCategoryFormSchema,
  faqItemFormSchema,
  type FaqCategoryFormInput,
  type FaqItemFormInput,
} from "@/admin/lib/validations/faq";

export type { FaqCategoryFormInput, FaqItemFormInput } from "@/admin/lib/validations/faq";
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
): Promise<ActionResult<{ id: string }>> {
  const parsed = faqCategoryFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "faq",
    action: "create",
    execute: async () => createFaqCategoryCommand(parsed.data),
    success: (result) => createSuccess("カテゴリを作成しました", result),
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
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = faqCategoryFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "faq",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => updateFaqCategoryCommand(validatedId.data, parsed.data),
    success: () => createSuccess("カテゴリを更新しました"),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function deleteFaqCategory(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "faq",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteFaqCategoryCommand(validated.data),
    success: () => createSuccess("カテゴリを削除しました"),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function reorderFaqCategories(
  orderedIds: string[],
): Promise<ActionResult<void>> {
  const parsed = orderedIdsSchema.safeParse(orderedIds);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "faq",
    action: "update",
    execute: async () => reorderFaqCategoriesCommand(parsed.data),
    success: () => createSuccess("順序を更新しました"),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function createFaqItem(
  data: FaqItemFormInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = faqItemFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const answerHtml = await renderEditorStateToHtmlLazy(parsed.data.answerJson);

  return executeAdminMutation({
    resource: "faq",
    action: "create",
    execute: async () =>
      createFaqItemCommand({
        ...parsed.data,
        answerHtml,
      }),
    success: (result) => createSuccess("質問を作成しました", result),
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
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = faqItemFormSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const answerHtml = await renderEditorStateToHtmlLazy(parsed.data.answerJson);

  return executeAdminMutation({
    resource: "faq",
    action: "update",
    resourceId: validatedId.data,
    execute: async () =>
      updateFaqItemCommand(validatedId.data, {
        ...parsed.data,
        answerHtml,
      }),
    success: () => createSuccess("質問を更新しました"),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function deleteFaqItem(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "faq",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteFaqItemCommand(validated.data),
    success: () => createSuccess("質問を削除しました"),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function reorderFaqItems(
  categoryId: string,
  orderedIds: string[],
): Promise<ActionResult<void>> {
  const validatedCategoryId = idSchema.safeParse(categoryId);
  if (!validatedCategoryId.success) {
    return createValidationError(validatedCategoryId.error);
  }

  const parsed = orderedIdsSchema.safeParse(orderedIds);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "faq",
    action: "update",
    resourceId: validatedCategoryId.data,
    execute: async () => reorderFaqItemsCommand(validatedCategoryId.data, parsed.data),
    success: () => createSuccess("順序を更新しました"),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function toggleFaqItemPublished(
  id: string,
): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "faq",
    action: "update",
    resourceId: validated.data,
    execute: async () => toggleFaqItemPublishedCommand(validated.data),
    success: (result) => createSuccess("公開状態を変更しました", result),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}
