"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  archiveTermsVersion as archiveTermsVersionCommand,
  createTerms as createTermsCommand,
  createTermsVersion as createTermsVersionCommand,
  createTermsWithVersion as createTermsWithVersionCommand,
  deleteTerms as deleteTermsCommand,
  deleteTermsVersion as deleteTermsVersionCommand,
  publishTermsVersion as publishTermsVersionCommand,
  toggleTermsActive as toggleTermsActiveCommand,
  updateTerms as updateTermsCommand,
  updateTermsVersion as updateTermsVersionCommand,
} from "@/shared/domain/terms/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeTermsCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result"
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
import {
  createTermsSchema,
  createTermsVersionSchema,
  type CreateTermsInput,
  type CreateTermsVersionInput,
  type UpdateTermsInput,
  type UpdateTermsVersionInput,
  updateTermsSchema,
  updateTermsVersionSchema,
} from "@/shared/lib/validations/terms";

const createTermsWithVersionSchema = createTermsSchema.extend({
  contentJson: lexicalJsonSchema,
});

const idSchema = z.string().uuid({ error: "IDが不正です" });
const toggleTermsActiveSchema = z.object({
  id: z.string().uuid({ error: "規約IDが不正です" }),
  isActive: z.boolean(),
});

function invalidateTermsCache(): void {
  updateTag(CACHE_TAGS.TERMS);
  fireAndForget(purgeTermsCache(), {
    operation: "purgeTermsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export async function createTerms(
  input: CreateTermsInput,
): Promise<MutationResult<{ id: string }>> {
  const validation = createTermsSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "create",
    execute: async () => createTermsCommand(validation.data),
    afterSuccess: invalidateTermsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function createTermsWithVersion(
  input: CreateTermsInput & { contentJson: string },
): Promise<MutationResult<{ id: string; versionId: string }>> {
  const validation = createTermsWithVersionSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    validation.data.contentJson,
  );

  return executeAdminMutationResult({
    resource: "terms",
    action: "create",
    execute: async (user) =>
      createTermsWithVersionCommand(
        {
          ...validation.data,
          contentHtml,
        },
        user.id,
      ),
    afterSuccess: invalidateTermsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateTerms(
  id: string,
  input: UpdateTermsInput,
): Promise<MutationResult> {
  const idValidation = idSchema.safeParse(id);
  if (!idValidation.success) {
    return createValidationMutationError(idValidation.error);
  }

  const validation = updateTermsSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "update",
    resourceId: idValidation.data,
    execute: async () => {
      await updateTermsCommand(idValidation.data, validation.data);
      return null;
    },
    afterSuccess: invalidateTermsCache,
  });
}

export async function deleteTerms(id: string): Promise<MutationResult> {
  const validation = idSchema.safeParse(id);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "delete",
    resourceId: validation.data,
    execute: async () => {
      await deleteTermsCommand(validation.data);
      return null;
    },
    afterSuccess: invalidateTermsCache,
  });
}

export async function toggleTermsActive(
  id: string,
  isActive: boolean,
): Promise<MutationResult> {
  const validation = toggleTermsActiveSchema.safeParse({ id, isActive });
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "update",
    resourceId: validation.data.id,
    execute: async () => {
      await toggleTermsActiveCommand(
        validation.data.id,
        validation.data.isActive,
      );
      return null;
    },
    afterSuccess: invalidateTermsCache,
  });
}

export async function createTermsVersion(
  input: CreateTermsVersionInput,
): Promise<MutationResult<{ id: string; version: number }>> {
  const validation = createTermsVersionSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    validation.data.contentJson,
  );

  return executeAdminMutationResult({
    resource: "terms",
    action: "create",
    resourceId: validation.data.termsId,
    execute: async (user) =>
      createTermsVersionCommand(
        {
          ...validation.data,
          contentHtml,
        },
        user.id,
      ),
    afterSuccess: invalidateTermsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateTermsVersion(
  versionId: string,
  input: UpdateTermsVersionInput,
): Promise<MutationResult> {
  const idValidation = idSchema.safeParse(versionId);
  if (!idValidation.success) {
    return createValidationMutationError(idValidation.error);
  }

  const validation = updateTermsVersionSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    validation.data.contentJson,
  );

  return executeAdminMutationResult({
    resource: "terms",
    action: "update",
    resourceId: idValidation.data,
    execute: async () => {
      await updateTermsVersionCommand(idValidation.data, {
        ...validation.data,
        contentHtml,
      });
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.TERMS);
    },
  });
}

export async function publishTermsVersion(
  versionId: string,
): Promise<MutationResult> {
  const validation = idSchema.safeParse(versionId);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "publish",
    resourceId: validation.data,
    execute: async (user) => {
      await publishTermsVersionCommand(validation.data, user.id);
      return null;
    },
    afterSuccess: invalidateTermsCache,
  });
}

export async function archiveTermsVersion(
  versionId: string,
): Promise<MutationResult> {
  const validation = idSchema.safeParse(versionId);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "update",
    resourceId: validation.data,
    execute: async () => {
      await archiveTermsVersionCommand(validation.data);
      return null;
    },
    afterSuccess: invalidateTermsCache,
  });
}

export async function deleteTermsVersion(
  versionId: string,
): Promise<MutationResult> {
  const validation = idSchema.safeParse(versionId);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "terms",
    action: "delete",
    resourceId: validation.data,
    execute: async () => {
      await deleteTermsVersionCommand(validation.data);
      return null;
    },
    afterSuccess: invalidateTermsCache,
  });
}
