"use server";

import { updateTag } from "next/cache";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { checkReadPermissionFor, isEditorRole } from "@/admin/lib/permissions";
import {
  createFailure,
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  bulkDeleteMediaCommand,
  deleteMediaCommand,
  updateMediaCommand,
  uploadMediaCommand,
} from "@/shared/domain/media/commands";
import {
  getMediaByIdQuery,
  getMediaListQuery,
} from "@/shared/domain/media/queries";
import {
  inferMediaType,
  mediaFiltersSchema,
  mediaPaginationSchema,
  mediaUpdateSchema,
  mediaUploadSchema,
  validateFile,
  type MediaFilters,
  type MediaPagination,
  type MediaUpdateInput,
} from "@/admin/lib/validations/media";
import type { MediaData, GetMediaResult } from "@/admin/types/media-picker";

function getFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

function getFormFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File ? value : null;
}

function getFormStringArray(formData: FormData, key: string): string[] {
  const value = getFormString(formData, key);
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

const checkReadPermission = checkReadPermissionFor("media");

function revalidateMedia(...ids: string[]): void {
  updateTag(CACHE_TAGS.MEDIA);
  for (const id of [...new Set(ids)]) {
    updateTag(getCacheTag.media.detail(id));
  }
}

export async function getMediaList(
  filters: MediaFilters = {},
  pagination: MediaPagination = { page: 1, limit: 24 },
): Promise<GetMediaResult> {
  if (!(await checkReadPermission())) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 };
  }

  const validatedFilters = mediaFiltersSchema.safeParse(filters);
  if (!validatedFilters.success) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 };
  }

  const validatedPagination = mediaPaginationSchema.safeParse(pagination);
  if (!validatedPagination.success) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 };
  }

  return getMediaListQuery(validatedFilters.data, validatedPagination.data);
}

export async function getMediaById(id: string): Promise<MediaData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return getMediaByIdQuery(id);
}

export async function uploadMedia(
  formData: FormData,
): Promise<ActionResult<{ id: string; url: string }>> {
  const file = getFormFile(formData, "file");
  if (!file) {
    return createFailure("ファイルが選択されていません");
  }

  const metadata = {
    type: getFormString(formData, "type") || undefined,
    usage: getFormString(formData, "usage") || undefined,
    alt: getFormString(formData, "alt") || undefined,
    title: getFormString(formData, "title") || undefined,
    description: getFormString(formData, "description") || undefined,
    tags: getFormStringArray(formData, "tags"),
  };

  const parsed = mediaUploadSchema.safeParse(metadata);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const mediaType = parsed.data.type || inferMediaType(file.type);
  const validation = validateFile(file, mediaType);
  if (!validation.valid) {
    return createFailure(validation.error ?? "アップロードに失敗しました");
  }

  return executeAdminMutation({
    resource: "media",
    action: "create",
    execute: async (user) =>
      uploadMediaCommand({
        file,
        folder: parsed.data.usage?.toLowerCase() || "general",
        uploadedBy: user.id,
        type: mediaType,
        usage: parsed.data.usage ?? null,
        alt: parsed.data.alt ?? null,
        title: parsed.data.title ?? null,
        description: parsed.data.description ?? null,
        tags: parsed.data.tags ?? [],
      }),
    success: (result) => createSuccess("アップロードしました", result),
    afterSuccess: (result) => {
      revalidateMedia(result.id);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updateMedia(
  id: string,
  data: MediaUpdateInput,
): Promise<ActionResult<void>> {
  const parsed = mediaUpdateSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
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
    },
    success: () => createSuccess("更新しました"),
    afterSuccess: () => {
      revalidateMedia(id);
    },
  });
}

export async function deleteMedia(id: string): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "media",
    action: "delete",
    resourceId: id,
    execute: async () => {
      await deleteMediaCommand(id);
    },
    success: () => createSuccess("削除しました"),
    afterSuccess: () => {
      revalidateMedia(id);
    },
  });
}

export async function bulkDeleteMedia(
  ids: string[],
): Promise<ActionResult<{ deleted: number }>> {
  return executeAdminMutation({
    resource: "media",
    action: "delete",
    execute: async () => bulkDeleteMediaCommand(ids),
    success: (result) =>
      createSuccess(
        result.deleted > 0
          ? `${result.deleted}件のメディアを削除しました`
          : "削除対象がありません",
        result,
      ),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.MEDIA);
    },
  });
}
