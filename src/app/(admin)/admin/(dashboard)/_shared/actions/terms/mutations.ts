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
import { createValidationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeTermsCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
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
): Promise<ActionResult<{ id: string }>> {
  const validation = createTermsSchema.safeParse(input);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "terms",
    action: "create",
    execute: async () => createTermsCommand(validation.data),
    success: (result) => createSuccess("規約を作成しました", result),
    afterSuccess: invalidateTermsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function createTermsWithVersion(
  input: CreateTermsInput & { contentJson: string },
): Promise<ActionResult<{ id: string; versionId: string }>> {
  const validation = createTermsWithVersionSchema.safeParse(input);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    validation.data.contentJson,
  );

  return executeAdminMutation({
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
    success: (result) => createSuccess("規約を作成しました", result),
    afterSuccess: invalidateTermsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateTerms(
  id: string,
  input: UpdateTermsInput,
): Promise<ActionResult<void>> {
  const idValidation = idSchema.safeParse(id);
  if (!idValidation.success) {
    return createValidationError(idValidation.error);
  }

  const validation = updateTermsSchema.safeParse(input);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "terms",
    action: "update",
    resourceId: idValidation.data,
    execute: async () => {
      await updateTermsCommand(idValidation.data, validation.data);
    },
    success: () => createSuccess("規約を更新しました"),
    afterSuccess: invalidateTermsCache,
  });
}

export async function deleteTerms(id: string): Promise<ActionResult<void>> {
  const validation = idSchema.safeParse(id);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "terms",
    action: "delete",
    resourceId: validation.data,
    execute: async () => {
      await deleteTermsCommand(validation.data);
    },
    success: () => createSuccess("規約を削除しました"),
    afterSuccess: invalidateTermsCache,
  });
}

export async function toggleTermsActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult<void>> {
  const validation = toggleTermsActiveSchema.safeParse({ id, isActive });
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "terms",
    action: "update",
    resourceId: validation.data.id,
    execute: async () => {
      await toggleTermsActiveCommand(
        validation.data.id,
        validation.data.isActive,
      );
    },
    success: () =>
      createSuccess(
        validation.data.isActive
          ? "規約を有効にしました"
          : "規約を無効にしました",
      ),
    afterSuccess: invalidateTermsCache,
  });
}

export async function createTermsVersion(
  input: CreateTermsVersionInput,
): Promise<ActionResult<{ id: string; version: number }>> {
  const validation = createTermsVersionSchema.safeParse(input);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    validation.data.contentJson,
  );

  return executeAdminMutation({
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
    success: (result) =>
      createSuccess(`バージョン ${result.version} を作成しました`, result),
    afterSuccess: invalidateTermsCache,
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateTermsVersion(
  versionId: string,
  input: UpdateTermsVersionInput,
): Promise<ActionResult<void>> {
  const idValidation = idSchema.safeParse(versionId);
  if (!idValidation.success) {
    return createValidationError(idValidation.error);
  }

  const validation = updateTermsVersionSchema.safeParse(input);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    validation.data.contentJson,
  );

  return executeAdminMutation({
    resource: "terms",
    action: "update",
    resourceId: idValidation.data,
    execute: async () => {
      await updateTermsVersionCommand(idValidation.data, {
        ...validation.data,
        contentHtml,
      });
    },
    success: () => createSuccess("バージョンを更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.TERMS);
    },
  });
}

export async function publishTermsVersion(
  versionId: string,
): Promise<ActionResult<void>> {
  const validation = idSchema.safeParse(versionId);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "terms",
    action: "publish",
    resourceId: validation.data,
    execute: async (user) => {
      await publishTermsVersionCommand(validation.data, user.id);
    },
    success: () => createSuccess("バージョンを公開しました"),
    afterSuccess: invalidateTermsCache,
  });
}

export async function archiveTermsVersion(
  versionId: string,
): Promise<ActionResult<void>> {
  const validation = idSchema.safeParse(versionId);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "terms",
    action: "update",
    resourceId: validation.data,
    execute: async () => {
      await archiveTermsVersionCommand(validation.data);
    },
    success: () => createSuccess("バージョンをアーカイブしました"),
    afterSuccess: invalidateTermsCache,
  });
}

export async function deleteTermsVersion(
  versionId: string,
): Promise<ActionResult<void>> {
  const validation = idSchema.safeParse(versionId);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "terms",
    action: "delete",
    resourceId: validation.data,
    execute: async () => {
      await deleteTermsVersionCommand(validation.data);
    },
    success: () => createSuccess("バージョンを削除しました"),
    afterSuccess: invalidateTermsCache,
  });
}
