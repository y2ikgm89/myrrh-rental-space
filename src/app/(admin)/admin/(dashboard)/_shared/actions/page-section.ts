"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgePageCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createPageSectionCommand,
  deletePageSectionCommand,
  duplicatePageSectionCommand,
  reorderPageSectionsCommand,
  togglePageSectionActiveCommand,
  updatePageSectionCommand,
} from "@/shared/domain/sections/commands";
import { getSectionPageIdQuery } from "@/shared/domain/sections/admin-queries";
import {
  updateSectionContentSchema,
  type UpdateSectionContentInput,
} from "@/shared/lib/validations/section";

const idSchema = z.string().uuid({ error: "IDが不正です" });

const createPageSectionSchema = z.object({
  pageId: z.string().uuid({ error: "ページIDが不正です" }),
  type: z.string().min(1, { error: "セクションタイプは必須です" }),
});

const reorderPageSectionsSchema = z.object({
  pageId: z.string().uuid({ error: "ページIDが不正です" }),
  orderedIds: z
    .array(z.string().uuid())
    .min(1, { error: "最低1つのセクションIDを指定してください" })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "重複するセクションIDが含まれます",
    }),
});

function revalidatePages(pageSlug: string) {
  updateTag(CACHE_TAGS.SECTIONS);
  updateTag(CACHE_TAGS.PAGE_SECTIONS);
  updateTag(CACHE_TAGS.PAGES);
  updateTag(getCacheTag.pages.detail(pageSlug));
  fireAndForget(purgePageCache(pageSlug), {
    operation: "purgePageCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

// =============================================================================
// updatePageSection
// =============================================================================

export async function updatePageSection(
  id: string,
  input: UpdateSectionContentInput,
): Promise<MutationResult<{ pageId: string }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsed = updateSectionContentSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resolveResourceId: () => getSectionPageIdQuery(parsedId.data),
    resolveAuditResourceId: () => parsedId.data,
    execute: async () => {
      const result = await updatePageSectionCommand(parsedId.data, parsed.data);
      return { pageId: result.pageId, pageSlug: result.pageSlug };
    },
    afterSuccess: (data) => {
      revalidatePages(data.pageSlug);
    },
  });
}

// =============================================================================
// createPageSection
// =============================================================================

export async function createPageSection(
  input: unknown,
): Promise<MutationResult<{ id: string; pageId: string }>> {
  const parsed = createPageSectionSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resourceId: parsed.data.pageId,
    execute: async () => {
      const result = await createPageSectionCommand(parsed.data);
      return {
        id: result.id,
        pageId: result.pageId,
        pageSlug: result.pageSlug,
      };
    },
    afterSuccess: (data) => {
      revalidatePages(data.pageSlug);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

// =============================================================================
// deletePageSection
// =============================================================================

export async function deletePageSection(
  id: string,
): Promise<MutationResult<{ id: string; pageId: string }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resolveResourceId: () => getSectionPageIdQuery(parsedId.data),
    resolveAuditResourceId: () => parsedId.data,
    execute: async () => {
      const result = await deletePageSectionCommand(parsedId.data);
      return {
        id: result.id,
        pageId: result.pageId,
        pageSlug: result.pageSlug,
      };
    },
    afterSuccess: (data) => {
      revalidatePages(data.pageSlug);
    },
  });
}

// =============================================================================
// duplicatePageSection
// =============================================================================

export async function duplicatePageSection(
  id: string,
): Promise<MutationResult<{ id: string; pageId: string }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resolveResourceId: () => getSectionPageIdQuery(parsedId.data),
    execute: async () => {
      const result = await duplicatePageSectionCommand(parsedId.data);
      return {
        id: result.id,
        pageId: result.pageId,
        pageSlug: result.pageSlug,
      };
    },
    afterSuccess: (data) => {
      revalidatePages(data.pageSlug);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

// =============================================================================
// togglePageSectionActive
// =============================================================================

export async function togglePageSectionActive(
  id: string,
): Promise<MutationResult<{ id: string; pageId: string; isActive: boolean }>> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resolveResourceId: () => getSectionPageIdQuery(parsedId.data),
    resolveAuditResourceId: () => parsedId.data,
    execute: async () => {
      const result = await togglePageSectionActiveCommand(parsedId.data);
      return {
        id: result.id,
        pageId: result.pageId,
        pageSlug: result.pageSlug,
        isActive: result.isActive,
      };
    },
    afterSuccess: (data) => {
      revalidatePages(data.pageSlug);
    },
  });
}

// =============================================================================
// reorderPageSections
// =============================================================================

export async function reorderPageSections(
  input: unknown,
): Promise<MutationResult<{ count: number; pageId: string }>> {
  const parsed = reorderPageSectionsSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resourceId: parsed.data.pageId,
    execute: async () => {
      const result = await reorderPageSectionsCommand({
        pageId: parsed.data.pageId,
        orderedIds: parsed.data.orderedIds,
      });
      return {
        count: result.count,
        pageId: result.pageId,
        pageSlug: result.pageSlug,
      };
    },
    afterSuccess: (data) => {
      revalidatePages(data.pageSlug);
    },
  });
}
