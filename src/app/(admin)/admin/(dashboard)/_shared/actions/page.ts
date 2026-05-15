"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgePageCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createPageCommand,
  deletePageCommand,
  deletePagePermanentlyCommand,
  restorePageCommand,
  updatePageCommand,
  updatePagePublishedCommand,
  updatePageSeoCommand,
  bulkDeletePagesCommand,
  bulkUpdatePagePublishedCommand,
} from "@/shared/domain/pages/commands";
import { getPageIdBySlugQuery } from "@/shared/domain/pages/admin-queries";
import {
  createPageSchema,
  getSystemPageDefinition,
  updatePageSchema,
  updatePageSeoSchema,
  type CreatePageInput,
  type UpdatePageInput,
} from "@/shared/lib/validations/page";

function purgePageCaches(...slugs: string[]): void {
  for (const slug of [...new Set(slugs)]) {
    fireAndForget(purgePageCache(slug), {
      operation: "purgePageCache",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
    });
  }
}

function invalidatePageTags(...slugs: string[]): void {
  updateTag(CACHE_TAGS.PAGES);
  for (const slug of [...new Set(slugs)]) {
    updateTag(getCacheTag.pages.detail(slug));
  }
}

function invalidatePageSeoTags(slug: string): void {
  updateTag(CACHE_TAGS.PAGE_SEO);
  updateTag(getCacheTag.pageSeo.detail(slug));
}

export async function updatePage(
  slug: string,
  input: UpdatePageInput,
): Promise<MutationResult> {
  const parsed = updatePageSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resolveResourceId: () => getPageIdBySlugQuery(slug),
    resolveAuditResourceId: () => slug,
    execute: async () => {
      await updatePageCommand(slug, parsed.data);
      return null;
    },
    afterSuccess: () => {
      invalidatePageTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function createPage(
  input: CreatePageInput,
): Promise<MutationResult<{ slug: string }>> {
  const parsed = createPageSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let createdSlug = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "create",
    execute: async () => {
      const result = await createPageCommand(parsed.data);
      createdSlug = result.slug;
      return result;
    },
    afterSuccess: () => {
      invalidatePageTags(createdSlug);
      purgePageCaches(createdSlug);
    },
    resolveAuditResourceId: (result) => result.slug,
  });
}

export async function deletePage(slug: string): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "page",
    action: "delete",
    resourceId: slug,
    execute: async () => {
      await deletePageCommand(slug);
      return null;
    },
    afterSuccess: () => {
      invalidatePageTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function deletePagePermanently(
  slug: string,
): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "page",
    action: "delete",
    resourceId: slug,
    execute: async () => {
      await deletePagePermanentlyCommand(slug);
      return null;
    },
    afterSuccess: () => {
      invalidatePageTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function restorePage(slug: string): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    checkResourceAccess: true,
    resolveResourceId: () => getPageIdBySlugQuery(slug),
    resolveAuditResourceId: () => slug,
    execute: async () => {
      await restorePageCommand(slug);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.PAGES);
      purgePageCaches(slug);
    },
  });
}

export async function updatePagePublished(
  slug: string,
  isPublished: boolean,
): Promise<MutationResult<{ isPublished: boolean }>> {
  return executeAdminMutationResult({
    resource: "page",
    action: "publish",
    resourceId: slug,
    execute: async () => updatePagePublishedCommand(slug, isPublished),
    afterSuccess: () => {
      invalidatePageTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function bulkUpdatePagePublished(
  slugs: string[],
  isPublished: boolean,
): Promise<MutationResult<{ count: number; isPublished: boolean }>> {
  return executeAdminMutationResult({
    resource: "page",
    action: "publish",
    execute: async () => {
      await bulkUpdatePagePublishedCommand(slugs, isPublished);
      return { count: slugs.length, isPublished };
    },
    afterSuccess: () => {
      invalidatePageTags(...slugs);
      purgePageCaches(...slugs);
    },
  });
}

export async function bulkDeletePages(
  slugs: string[],
): Promise<MutationResult<{ deletedCount: number; deletedSlugs: string[] }>> {
  return executeAdminMutationResult({
    resource: "page",
    action: "delete",
    execute: async () => {
      const result = await bulkDeletePagesCommand(slugs);
      return {
        deletedCount: result.deletedSlugs.length,
        deletedSlugs: result.deletedSlugs,
      };
    },
    afterSuccess: (result) => {
      invalidatePageTags(...result.deletedSlugs);
      purgePageCaches(...result.deletedSlugs);
    },
  });
}

export async function updatePageSeo(
  slug: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, updatePageSeoSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "page",
      action: "update",
      checkResourceAccess: true,
      resolveResourceId: () => getPageIdBySlugQuery(slug),
      resolveAuditResourceId: () => slug,
      execute: async () => {
        const definition = getSystemPageDefinition(slug);
        await updatePageSeoCommand(slug, {
          ...data,
          title: data.title || definition?.title || slug,
        });
        return null;
      },
      afterSuccess: () => {
        invalidatePageTags(slug);
        invalidatePageSeoTags(slug);
        purgePageCaches(slug);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
