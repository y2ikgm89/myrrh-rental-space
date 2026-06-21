"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import { firePurgeAsync } from "@/shared/lib/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createPageCommand,
  deletePageCommand,
  deletePagePermanentlyCommand,
  restorePageCommand,
  updatePagePublishedCommand,
  updatePageSeoCommand,
  bulkDeletePagesCommand,
  bulkUpdatePagePublishedCommand,
} from "@/shared/domain/pages/commands";
import { getPageIdBySlugQuery } from "@/shared/domain/pages/admin-queries";
import {
  createPageSchema,
  updatePageSeoSchema,
} from "@/shared/lib/validations/page";

function purgePageCaches(...slugs: string[]): void {
  const unique = [...new Set(slugs)].map((s) => (s === "home" ? "/" : `/${s}`));
  if (unique.length === 0) return;
  void firePurgeAsync(() => purgeCloudflareDetailUrls(unique), {
    operation: "purgePageDetailUrls",
    urls: unique,
  });
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

/**
 * 新規 page 作成 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function createPage(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, createPageSchema, async (data) => {
    let createdSlug = "";

    const result = await executeAdminMutationResult({
      resource: "page",
      action: "create",
      execute: async () => {
        const created = await createPageCommand(data);
        createdSlug = created.slug;
        return created;
      },
      afterSuccess: () => {
        invalidatePageTags(createdSlug);
        purgePageCaches(createdSlug);
      },
      resolveAuditResourceId: (created) => created.slug,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
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
      invalidatePageTags(slug);
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
        // title は schema で `min(1)` 必須のため fallback 不要（dead branch だった）
        await updatePageSeoCommand(slug, data);
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
