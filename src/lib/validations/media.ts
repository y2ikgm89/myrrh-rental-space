/**
 * メディア管理 - バリデーションスキーマ
 */

import { z } from 'zod/v4'
import {
  MediaType,
  MediaUsage,
  isValidMediaType,
  isValidMediaUsage,
} from './enums'

// Re-export
export { MediaType, MediaUsage, isValidMediaType, isValidMediaUsage }

// =============================================================================
// Zod Schemas for Prisma Enums
// =============================================================================

export const MediaTypeEnum = z.enum(
  Object.values(MediaType) as [MediaType, ...MediaType[]]
)

export const MediaUsageEnum = z.enum(
  Object.values(MediaUsage) as [MediaUsage, ...MediaUsage[]]
)

// =============================================================================
// Constants
// =============================================================================

export const ALLOWED_MIME_TYPES: Record<MediaType, string[]> = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
  VIDEO: ['video/mp4', 'video/webm', 'video/quicktime'],
  DOCUMENT: ['application/pdf'],
  OTHER: [],
}

export const MAX_FILE_SIZES: Record<MediaType, number> = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  VIDEO: 100 * 1024 * 1024, // 100MB
  DOCUMENT: 10 * 1024 * 1024, // 10MB
  OTHER: 5 * 1024 * 1024, // 5MB
}

// =============================================================================
// Schemas
// =============================================================================

/**
 * メディアアップロード入力
 */
export const mediaUploadSchema = z.object({
  type: MediaTypeEnum.default('IMAGE'),
  usage: MediaUsageEnum.default('GENERAL'),
  alt: z.string().max(200, '代替テキストは200文字以内で入力してください').optional(),
  title: z.string().max(100, 'タイトルは100文字以内で入力してください').optional(),
  description: z.string().max(500, '説明は500文字以内で入力してください').optional(),
  tags: z
    .array(z.string().max(50, 'タグは50文字以内で入力してください'))
    .max(10, 'タグは最大10個まで設定できます')
    .default([]),
})

export type MediaUploadInput = z.infer<typeof mediaUploadSchema>

/**
 * メディア更新入力
 */
export const mediaUpdateSchema = z.object({
  alt: z.string().max(200, '代替テキストは200文字以内で入力してください').optional(),
  title: z.string().max(100, 'タイトルは100文字以内で入力してください').optional(),
  description: z.string().max(500, '説明は500文字以内で入力してください').optional(),
  tags: z
    .array(z.string().max(50, 'タグは50文字以内で入力してください'))
    .max(10, 'タグは最大10個まで設定できます')
    .optional(),
  usage: MediaUsageEnum.optional(),
})

export type MediaUpdateInput = z.infer<typeof mediaUpdateSchema>

/**
 * メディアフィルター
 */
export const mediaFiltersSchema = z.object({
  type: MediaTypeEnum.optional(),
  usage: MediaUsageEnum.optional(),
  search: z.string().optional(),
  mimeType: z.string().optional(),
})

export type MediaFilters = z.infer<typeof mediaFiltersSchema>

/**
 * メディアページネーション
 */
export const mediaPaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(24),
})

export type MediaPagination = z.infer<typeof mediaPaginationSchema>

// =============================================================================
// Helpers
// =============================================================================

/**
 * ファイルタイプからMediaTypeを推定
 */
export function inferMediaType(mimeType: string): MediaType {
  if (mimeType.startsWith('image/')) return 'IMAGE'
  if (mimeType.startsWith('video/')) return 'VIDEO'
  if (mimeType === 'application/pdf') return 'DOCUMENT'
  return 'OTHER'
}

/**
 * MIMEタイプのバリデーション
 */
export function isAllowedMimeType(mimeType: string, type?: MediaType): boolean {
  const mediaType = type || inferMediaType(mimeType)
  const allowedTypes = ALLOWED_MIME_TYPES[mediaType]
  return allowedTypes.includes(mimeType) || allowedTypes.length === 0
}

/**
 * ファイルサイズのバリデーション
 */
export function isAllowedFileSize(size: number, type: MediaType): boolean {
  return size <= MAX_FILE_SIZES[type]
}

/**
 * ファイルバリデーション
 */
export function validateFile(
  file: File,
  type?: MediaType
): { valid: true } | { valid: false; error: string } {
  const mediaType = type || inferMediaType(file.type)

  if (!isAllowedMimeType(file.type, mediaType)) {
    const allowed = ALLOWED_MIME_TYPES[mediaType].join(', ') || 'なし'
    return {
      valid: false,
      error: `対応していないファイル形式です。対応形式: ${allowed}`,
    }
  }

  if (!isAllowedFileSize(file.size, mediaType)) {
    const maxSizeMB = Math.round(MAX_FILE_SIZES[mediaType] / (1024 * 1024))
    return {
      valid: false,
      error: `ファイルサイズは${maxSizeMB}MB以下にしてください`,
    }
  }

  return { valid: true }
}

/**
 * MediaTypeフィルター用パーサー
 */
export function parseMediaTypeFilter(
  value: string | null | undefined
): MediaType | undefined {
  if (!value) return undefined
  return isValidMediaType(value) ? value : undefined
}

/**
 * MediaUsageフィルター用パーサー
 */
export function parseMediaUsageFilter(
  value: string | null | undefined
): MediaUsage | undefined {
  if (!value) return undefined
  return isValidMediaUsage(value) ? value : undefined
}
