"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { isEditorRole } from "@/admin/lib/permissions";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type {
  MutationError,
  MutationResult,
} from "@/shared/lib/mutation-result";
import {
  bulkDeleteMediaCommand,
  deleteMediaCommand,
  updateMediaCommand,
  uploadMediaCommand,
} from "@/shared/domain/media/commands";
import {
  inferMediaType,
  parseMediaUploadFormData,
  mediaUpdateSchema,
  validateFile,
  type MediaUpdateInput,
} from "@/admin/lib/validations/media";

function revalidateMedia(...ids: string[]): void {
  updateTag(CACHE_TAGS.MEDIA);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.media.detail(id));
  }
}

export async function uploadMedia(
  formData: FormData,
): Promise<MutationResult<{ id: string; url: string }>> {
  const parsedUpload = parseMediaUploadFormData(formData);
  if (parsedUpload.kind === "error") {
    return { error: parsedUpload.error } satisfies MutationError;
  }
  if (parsedUpload.kind === "validation-error") {
    return createValidationMutationError(parsedUpload.error);
  }

  const { file, metadata } = parsedUpload.data;
  const mediaType = metadata.type || inferMediaType(file.type);
  const validation = validateFile(file, mediaType);
  if (!validation.valid) {
    return {
      error: validation.error ?? "アップロードに失敗しました",
    } satisfies MutationError;
  }

  return executeAdminMutationResult({
    resource: "media",
    action: "create",
    execute: async (user) =>
      uploadMediaCommand({
        file,
        folder: metadata.usage?.toLowerCase() || "general",
        uploadedBy: user.id,
        type: mediaType,
        usage: metadata.usage ?? null,
        alt: metadata.alt ?? null,
        title: metadata.title ?? null,
        description: metadata.description ?? null,
        tags: metadata.tags ?? [],
      }),
    afterSuccess: (result) => {
      revalidateMedia(result.id);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateMedia(
  id: string,
  data: MediaUpdateInput,
): Promise<MutationResult> {
  const parsed = mediaUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "media",
    action: "update",
    resourceId: id,
    execute: async (user) => {
      await updateMediaCommand({
        id,
        userId: user.id,
        restrictToOwnUploads: isEditorRole(user.role),
        alt: parsed.data.alt ?? null,
        title: parsed.data.title ?? null,
        description: parsed.data.description ?? null,
        tags: parsed.data.tags ?? [],
        usage: parsed.data.usage ?? "GENERAL",
      });
      return null;
    },
    afterSuccess: () => {
      revalidateMedia(id);
    },
  });
}

export async function deleteMedia(id: string): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "media",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteMediaCommand(id);
      return null;
    },
    afterSuccess: () => {
      revalidateMedia(id);
    },
  });
}

export async function bulkDeleteMedia(
  ids: string[],
): Promise<MutationResult<{ deleted: number }>> {
  return executeAdminMutationResult({
    resource: "media",
    action: "delete",
    execute: async () => bulkDeleteMediaCommand(ids),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.MEDIA);
    },
  });
}
