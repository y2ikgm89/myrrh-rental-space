/**
 * メディア管理 - バリデーションスキーマ
 */

import { z } from "zod";
import {
  MediaType,
  MediaUsage,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  isValidMediaType,
  isValidMediaUsage,
} from "@/shared/lib/validations/enums/guards";

// Re-export
export { MediaType, MediaUsage, isValidMediaType, isValidMediaUsage };

// =============================================================================
// Zod Schemas for Prisma Enums
// =============================================================================

export const MediaTypeEnum = z.enum(MediaType);

export const MediaUsageEnum = z.enum(MediaUsage);

// =============================================================================
// Constants
// =============================================================================

export const ALLOWED_MIME_TYPES: Record<MediaType, string[]> = {
  IMAGE: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ],
  VIDEO: ["video/mp4", "video/webm", "video/quicktime"],
  DOCUMENT: ["application/pdf"],
  OTHER: [],
};

export const MAX_FILE_SIZES: Record<MediaType, number> = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  VIDEO: 100 * 1024 * 1024, // 100MB
  DOCUMENT: 10 * 1024 * 1024, // 10MB
  OTHER: 5 * 1024 * 1024, // 5MB
};

// =============================================================================
// Schemas
// =============================================================================

/**
 * メディアアップロード入力
 */
export const mediaUploadSchema = z.object({
  type: MediaTypeEnum.default("IMAGE"),
  usage: MediaUsageEnum.default("GENERAL"),
  alt: z
    .string()
    .max(200, { error: "代替テキストは200文字以内で入力してください" })
    .optional(),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内で入力してください" })
    .optional(),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内で入力してください" })
    .optional(),
  tags: z
    .array(z.string().max(50, { error: "タグは50文字以内で入力してください" }))
    .max(10, { error: "タグは最大10個まで設定できます" })
    .default([]),
});

export type MediaUploadInput = z.infer<typeof mediaUploadSchema>;

export type ParsedMediaUploadFormData =
  | {
      kind: "success";
      data: {
        file: File;
        metadata: MediaUploadInput;
      };
    }
  | {
      kind: "error";
      error: string;
    }
  | {
      kind: "validation-error";
      error: z.ZodError<MediaUploadInput>;
    };

/**
 * メディア更新入力
 */
export const mediaUpdateSchema = z.object({
  alt: z
    .string()
    .max(200, { error: "代替テキストは200文字以内で入力してください" })
    .optional(),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内で入力してください" })
    .optional(),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内で入力してください" })
    .optional(),
  tags: z
    .array(z.string().max(50, { error: "タグは50文字以内で入力してください" }))
    .max(10, { error: "タグは最大10個まで設定できます" })
    .optional(),
  usage: MediaUsageEnum.optional(),
});

export type MediaUpdateInput = z.infer<typeof mediaUpdateSchema>;

/**
 * メディアフィルター
 */
export const mediaFiltersSchema = z.object({
  type: MediaTypeEnum.optional(),
  usage: MediaUsageEnum.optional(),
  search: z.string().optional(),
  mimeType: z.string().optional(),
});

export type MediaFilters = z.infer<typeof mediaFiltersSchema>;

/**
 * メディアページネーション
 */
export const mediaPaginationSchema = z.object({
  page: z.coerce
    .number()
    .int({ error: "ページ番号が不正です" })
    .min(1, { error: "ページ番号は1以上で入力してください" })
    .default(1),
  limit: z.coerce
    .number()
    .int({ error: "表示件数が不正です" })
    .min(1, { error: "表示件数は1以上で入力してください" })
    .max(100, { error: "表示件数は100件以下で入力してください" })
    .default(24),
});

export type MediaPagination = z.infer<typeof mediaPaginationSchema>;

// =============================================================================
// Helpers
// =============================================================================

/**
 * ファイルタイプからMediaTypeを推定
 */
export function inferMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType === "application/pdf") return "DOCUMENT";
  return "OTHER";
}

/**
 * MIMEタイプのバリデーション
 */
export function isAllowedMimeType(mimeType: string, type?: MediaType): boolean {
  const mediaType = type || inferMediaType(mimeType);
  const allowedTypes = ALLOWED_MIME_TYPES[mediaType];
  return allowedTypes.includes(mimeType);
}

/**
 * ファイルサイズのバリデーション
 */
export function isAllowedFileSize(size: number, type: MediaType): boolean {
  return size <= MAX_FILE_SIZES[type];
}

/**
 * ファイルバリデーション
 */
export function validateFile(
  file: File,
  type?: MediaType,
): { valid: true } | { valid: false; error: string } {
  const mediaType = type || inferMediaType(file.type);

  if (!isAllowedMimeType(file.type, mediaType)) {
    const allowed = ALLOWED_MIME_TYPES[mediaType].join(", ") || "なし";
    return {
      valid: false,
      error: `対応していないファイル形式です。対応形式: ${allowed}`,
    };
  }

  if (!isAllowedFileSize(file.size, mediaType)) {
    const maxSizeMB = Math.round(MAX_FILE_SIZES[mediaType] / (1024 * 1024));
    return {
      valid: false,
      error: `ファイルサイズは${maxSizeMB}MB以下にしてください`,
    };
  }

  return { valid: true };
}

/**
 * MediaTypeフィルター用パーサー
 */
export function parseMediaTypeFilter(
  value: string | null | undefined,
): MediaType | undefined {
  if (!value) return undefined;
  return isValidMediaType(value) ? value : undefined;
}

/**
 * MediaUsageフィルター用パーサー
 */
export function parseMediaUsageFilter(
  value: string | null | undefined,
): MediaUsage | undefined {
  if (!value) return undefined;
  return isValidMediaUsage(value) ? value : undefined;
}

const mediaTagsInputSchema = z
  .array(z.string())
  .max(10, { error: "タグは最大10個まで設定できます" });

export function parseMediaTagsInput(
  value: FormDataEntryValue | null | undefined,
): { success: true; data: string[] } | { success: false; error: string } {
  if (value == null) {
    return { success: true, data: [] };
  }

  if (typeof value !== "string") {
    return { success: false, error: "tags は JSON 文字列で指定してください" };
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    return { success: false, error: "tags は JSON 配列で指定してください" };
  }

  const parsedTags = mediaTagsInputSchema.safeParse(parsedValue);
  if (!parsedTags.success) {
    return {
      success: false,
      error:
        parsedTags.error.issues[0]?.message ??
        "tags は文字列配列で指定してください",
    };
  }

  return { success: true, data: parsedTags.data };
}

function getFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export function parseMediaUploadFormData(
  formData: FormData,
): ParsedMediaUploadFormData {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { kind: "error", error: "ファイルが選択されていません" };
  }

  const tagsResult = parseMediaTagsInput(formData.get("tags"));
  if (!tagsResult.success) {
    return { kind: "error", error: tagsResult.error };
  }

  const metadataResult = mediaUploadSchema.safeParse({
    type: getFormString(formData, "type"),
    usage: getFormString(formData, "usage"),
    alt: getFormString(formData, "alt"),
    title: getFormString(formData, "title"),
    description: getFormString(formData, "description"),
    tags: tagsResult.data,
  });

  if (!metadataResult.success) {
    return { kind: "validation-error", error: metadataResult.error };
  }

  return {
    kind: "success",
    data: {
      file,
      metadata: metadataResult.data,
    },
  };
}
