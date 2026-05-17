"use server";

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  createTermsCommand,
  hardDeleteTermsCommand,
  restoreTermsCommand,
  softDeleteTermsCommand,
  updateTermsCommand,
  updateTermsPublishedCommand,
} from "@/shared/domain/terms/commands";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { termsFormSchema } from "../../../terms/_components/terms-form-schema";

function invalidateTermsCaches(slug?: string, previousSlug?: string) {
  updateTag(CACHE_TAGS.TERMS);
  updateTag(getCacheTag.terms.footer());
  if (slug) updateTag(getCacheTag.terms.detail(slug));
  if (previousSlug && previousSlug !== slug) {
    updateTag(getCacheTag.terms.detail(previousSlug));
  }
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

// =============================================================================
// Conform `useActionState` 用 Server Actions
//
// `(prev, formData) => SubmissionResult` signature。TermsForm (page 遷移付き form)
// で `<form action={action}>` 経由で利用される。create は新規作成ページ、update は
// id を bind で部分適用。
// =============================================================================

export async function createTermsAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, termsFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "terms",
      action: "create",
      execute: async () => createTermsCommand(data),
      afterSuccess: (output) => {
        invalidateTermsCaches(output.slug);
      },
      resolveAuditResourceId: (output) => output.id,
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateTermsAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, termsFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "terms",
      action: "update",
      resourceId: id,
      execute: async () => updateTermsCommand(id, data),
      afterSuccess: (output) => {
        invalidateTermsCaches(output.slug, output.previousSlug);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
