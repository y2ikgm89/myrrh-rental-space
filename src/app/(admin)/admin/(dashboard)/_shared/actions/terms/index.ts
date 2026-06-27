"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateSiteWideCache, firePurgeAsync } from "@/shared/lib/cache";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  createTermsCommand,
  hardDeleteTermsCommand,
  reorderTermsCommand,
  restoreTermsCommand,
  softDeleteTermsCommand,
  updateTermsCommand,
  updateTermsPublishedCommand,
} from "@/shared/domain/terms/commands";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  termsFormSchema,
  type TermsFormInput,
  type TermsMutationInput,
} from "@/shared/lib/validations/terms";
import { renderEditorStateJsonToHtmlServer } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-server";

const orderedIdsSchema = z
  .array(z.uuid({ error: "IDが不正です" }))
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じIDを複数指定することはできません",
  });

function invalidateTermsCaches(slug?: string, previousSlug?: string): void {
  // Belt-and-suspenders: parent CACHE_TAGS.TERMS AND explicit sub-tags.
  // OR-tag-matching makes the sub-tag updateTag calls redundant TODAY because
  // every reader co-tags TERMS, but removing them would create a foot-gun where
  // a future reader tagged with ONLY a sub-tag silently misses invalidation.
  invalidateSiteWideCache(CACHE_TAGS.TERMS);
  updateTag(getCacheTag.terms.footer());
  if (slug) updateTag(getCacheTag.terms.detail(slug));
  if (previousSlug && previousSlug !== slug) {
    updateTag(getCacheTag.terms.detail(previousSlug));
  }

  // CDN per-detail URL purge (slug-keyed).
  const paths: string[] = [];
  if (slug) paths.push(`/terms/${slug}`);
  if (previousSlug && previousSlug !== slug)
    paths.push(`/terms/${previousSlug}`);
  if (paths.length > 0) {
    void firePurgeAsync(() => purgeCloudflareDetailUrls(paths), {
      operation: "invalidateTermsCaches.detailUrlPurge",
      urls: paths,
    });
  }
}

/** Lexical 公式: contentJson 正本 → server 派生 HTML（sanitize は command 層） */
function toTermsFormInput(input: TermsMutationInput): TermsFormInput {
  return {
    ...input,
    contentHtml: renderEditorStateJsonToHtmlServer(input.contentJson),
  };
}

export async function deleteTerms(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  return executeAdminMutationResult({
    resource: "terms",
    action: "delete",
    resourceId: id,
    execute: async () => softDeleteTermsCommand(id),
    afterSuccess: (data) => {
      invalidateTermsCaches(data.slug);
    },
  });
}

export async function hardDeleteTerms(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  return executeAdminMutationResult({
    resource: "terms",
    action: "delete",
    resourceId: id,
    execute: async () => hardDeleteTermsCommand(id),
    afterSuccess: () => {
      invalidateTermsCaches();
    },
  });
}

export async function updateTermsPublished(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<{ id: string; slug: string; isPublished: boolean }>> {
  return executeAdminMutationResult({
    resource: "terms",
    action: "publish",
    resourceId: id,
    execute: async () => updateTermsPublishedCommand(id, isPublished),
    afterSuccess: (data) => {
      invalidateTermsCaches(data.slug);
    },
  });
}

export async function reorderTerms(
  orderedIds: string[],
): Promise<MutationResult<{ updated: number }>> {
  const parsed = orderedIdsSchema.safeParse(orderedIds);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "update",
    execute: async () => reorderTermsCommand(parsed.data),
    afterSuccess: () => {
      invalidateTermsCaches();
    },
  });
}

export async function restoreTerms(
  id: string,
): Promise<MutationResult<{ id: string; slug: string }>> {
  return executeAdminMutationResult({
    resource: "terms",
    action: "update",
    resourceId: id,
    execute: async () => restoreTermsCommand(id),
    afterSuccess: (data) => {
      invalidateTermsCaches(data.slug);
    },
  });
}

export async function createTerms(
  input: TermsMutationInput,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const parsed = termsFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "create",
    execute: async () => createTermsCommand(toTermsFormInput(parsed.data)),
    afterSuccess: (data) => {
      invalidateTermsCaches(data.slug);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function updateTerms(
  id: string,
  input: TermsMutationInput,
): Promise<MutationResult<{ id: string; slug: string }>> {
  const parsed = termsFormSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "update",
    resourceId: id,
    execute: async () => updateTermsCommand(id, toTermsFormInput(parsed.data)),
    afterSuccess: (data) => {
      invalidateTermsCaches(data.slug, data.previousSlug);
    },
  });
}
