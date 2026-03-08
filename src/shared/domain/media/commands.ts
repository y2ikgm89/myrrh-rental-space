import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { STORAGE_BUCKETS } from "@/shared/lib/supabase";
import { deleteFile, deleteFiles, uploadFile } from "@/shared/lib/storage";
import type { MediaType, MediaUsage } from "@/shared/lib/validations/enums";

export async function uploadMediaCommand(input: {
  file: File;
  folder: string;
  uploadedBy: string;
  type: MediaType;
  usage?: MediaUsage | null;
  alt?: string | null;
  title?: string | null;
  description?: string | null;
  tags: string[];
}): Promise<{ id: string; url: string }> {
  let uploadedPath: string | undefined;

  try {
    const result = await uploadFile(input.file, STORAGE_BUCKETS.MEDIA, {
      folder: input.folder,
    });

    if (!result.success || !result.url || !result.path) {
      throw new DomainError(result.error || "アップロードに失敗しました", "UNEXPECTED");
    }

    uploadedPath = result.path;

    const media = await prisma.media.create({
      data: {
        filename: input.file.name,
        storagePath: result.path,
        url: result.url,
        bucket: STORAGE_BUCKETS.MEDIA,
        mimeType: input.file.type,
        size: input.file.size,
        width: null,
        height: null,
        type: input.type,
        usage: input.usage || "GENERAL",
        alt: input.alt ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        tags: input.tags,
        uploadedBy: input.uploadedBy,
      },
      select: {
        id: true,
        url: true,
      },
    });

    return media;
  } catch (error) {
    if (uploadedPath) {
      await deleteFile(uploadedPath, STORAGE_BUCKETS.MEDIA);
    }

    if (error instanceof DomainError) {
      throw error;
    }

    throw new DomainError("アップロードに失敗しました", "UNEXPECTED");
  }
}

export async function updateMediaCommand(input: {
  id: string;
  userId: string;
  restrictToOwnUploads: boolean;
  alt: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  usage: MediaUsage;
}): Promise<void> {
  const existing = await prisma.media.findUnique({
    where: { id: input.id, isActive: true },
    select: { id: true, uploadedBy: true },
  });

  if (!existing) {
    throw new DomainError("メディアが見つかりません", "NOT_FOUND");
  }

  if (input.restrictToOwnUploads && existing.uploadedBy !== input.userId) {
    throw new DomainError("このメディアを編集する権限がありません", "UNAUTHORIZED");
  }

  await prisma.media.update({
    where: { id: input.id },
    data: {
      alt: input.alt,
      title: input.title,
      description: input.description,
      tags: input.tags,
      usage: input.usage,
    },
  });
}

export async function deleteMediaCommand(id: string): Promise<void> {
  const media = await prisma.media.findUnique({
    where: { id, isActive: true },
    select: { id: true, storagePath: true },
  });

  if (!media) {
    throw new DomainError("メディアが見つかりません", "NOT_FOUND");
  }

  await deleteFile(media.storagePath, STORAGE_BUCKETS.MEDIA);
  await prisma.media.update({
    where: { id },
    data: { isActive: false },
  });
}

export async function bulkDeleteMediaCommand(ids: string[]): Promise<{ deleted: number }> {
  if (ids.length === 0) {
    return { deleted: 0 };
  }

  const mediaItems = await prisma.media.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, storagePath: true },
  });

  if (mediaItems.length === 0) {
    throw new DomainError("削除対象が見つかりません", "NOT_FOUND");
  }

  await deleteFiles(
    mediaItems.map((media) => media.storagePath),
    STORAGE_BUCKETS.MEDIA,
  );

  await prisma.media.updateMany({
    where: { id: { in: ids } },
    data: { isActive: false },
  });

  return { deleted: mediaItems.length };
}
