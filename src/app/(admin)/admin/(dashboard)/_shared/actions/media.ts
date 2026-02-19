'use server'

/**
 * メディア管理 Server Actions
 *
 * 管理画面でのメディアファイル操作を提供するServer Actions。
 * 画像のアップロード、更新、削除、一覧取得などを行います。
 *
 * ## 主な機能
 * - メディアアップロード（画像バリデーション付き）
 * - メディア一覧取得（フィルタ・ページネーション対応）
 * - メディア更新（メタデータ編集）
 * - メディア削除（単一・一括）
 *
 * @module admin/actions/media
 */

import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { prisma, Prisma } from '@/shared/lib/prisma'
import { STORAGE_BUCKETS } from '@/shared/lib/supabase'
import { uploadFile, deleteFile, deleteFiles } from '@/shared/lib/storage'
import { parseStringArray } from '@/shared/lib/json-validators'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { checkPermission, logAction } from '@/admin/lib/action-auth'
import { isEditorRole } from '@/admin/lib/permissions'
import {
  mediaUploadSchema,
  mediaUpdateSchema,
  mediaFiltersSchema,
  mediaPaginationSchema,
  inferMediaType,
  validateFile,
  type MediaFilters,
  type MediaPagination,
  type MediaUpdateInput,
} from '@/admin/lib/validations/media'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import type { MediaData, GetMediaResult } from '@/admin/types/media-picker'

// =============================================================================
// FormData Helper Functions
// =============================================================================

/**
 * FormDataから安全に文字列値を取得
 */
function getFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return typeof value === 'string' ? value : null
}

/**
 * FormDataから安全にFileを取得
 */
function getFormFile(formData: FormData, key: string): File | null {
  const value = formData.get(key)
  return value instanceof File ? value : null
}

/**
 * FormDataから安全にJSON配列を取得
 */
function getFormStringArray(formData: FormData, key: string): string[] {
  const value = getFormString(formData, key)
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('media')

type MediaWithUploader = Prisma.MediaGetPayload<{
  include: { uploader: { select: { id: true; name: true } } }
}>

function transformMedia(media: MediaWithUploader): MediaData {
  return {
    id: media.id,
    filename: media.filename,
    url: media.url,
    mimeType: media.mimeType,
    size: media.size,
    width: media.width,
    height: media.height,
    type: media.type,
    usage: media.usage,
    alt: media.alt,
    title: media.title,
    description: media.description,
    tags: parseStringArray(media.tags),
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    uploader: {
      id: media.uploader.id,
      name: media.uploader.name,
    },
  }
}

// =============================================================================
// Read Operations
// =============================================================================

/**
 * メディア一覧取得
 */
export async function getMediaList(
  filters: MediaFilters = {},
  pagination: MediaPagination = { page: 1, limit: 24 }
): Promise<GetMediaResult> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 }
  }

  const validatedFilters = mediaFiltersSchema.safeParse(filters)
  if (!validatedFilters.success) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 }
  }

  const validatedPagination = mediaPaginationSchema.safeParse(pagination)
  if (!validatedPagination.success) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 }
  }

  const { page, limit } = validatedPagination.data
  const skip = (page - 1) * limit

  // Build where clause
  const where: Prisma.MediaWhereInput = {
    isActive: true,
  }

  if (validatedFilters.data.type) {
    where.type = validatedFilters.data.type
  }

  if (validatedFilters.data.usage) {
    where.usage = validatedFilters.data.usage
  }

  if (validatedFilters.data.mimeType) {
    where.mimeType = { contains: validatedFilters.data.mimeType }
  }

  if (validatedFilters.data.search) {
    where.OR = [
      { filename: { contains: validatedFilters.data.search, mode: 'insensitive' } },
      { title: { contains: validatedFilters.data.search, mode: 'insensitive' } },
      { alt: { contains: validatedFilters.data.search, mode: 'insensitive' } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { uploader: { select: { id: true, name: true } } },
    }),
    prisma.media.count({ where }),
  ])

  return {
    items: items.map(transformMedia),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * メディア詳細取得
 */
export async function getMediaById(id: string): Promise<MediaData | null> {
  const hasPermissionResult = await checkReadPermission()
  if (!hasPermissionResult) return null

  const media = await prisma.media.findUnique({
    where: { id, isActive: true },
    include: { uploader: { select: { id: true, name: true } } },
  })

  return media ? transformMedia(media) : null
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * メディアアップロード
 */
export async function uploadMedia(
  formData: FormData
): Promise<ActionResult<{ id: string; url: string }>> {
  const auth = await checkPermission('media', 'create')
  if (!auth.success) return auth.error

  const user = auth.user

  const file = getFormFile(formData, 'file')
  if (!file) {
    return createFailure('ファイルが選択されていません')
  }

  // Parse metadata from form
  const metadata = {
    type: getFormString(formData, 'type') || undefined,
    usage: getFormString(formData, 'usage') || undefined,
    alt: getFormString(formData, 'alt') || undefined,
    title: getFormString(formData, 'title') || undefined,
    description: getFormString(formData, 'description') || undefined,
    tags: getFormStringArray(formData, 'tags'),
  }

  // Validate metadata
  const parsed = mediaUploadSchema.safeParse(metadata)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  // Infer media type from file
  const mediaType = parsed.data.type || inferMediaType(file.type)

  // Validate file
  const validation = validateFile(file, mediaType)
  if (!validation.valid) {
    return createFailure(validation.error)
  }

  let uploadedPath: string | undefined

  try {
    // Upload to Supabase Storage
    const result = await uploadFile(file, STORAGE_BUCKETS.MEDIA, {
      folder: parsed.data.usage?.toLowerCase() || 'general',
    })

    if (!result.success || !result.url || !result.path) {
      return createFailure(result.error || 'アップロードに失敗しました')
    }

    uploadedPath = result.path

    const width: number | null = null
    const height: number | null = null

    // Create media record
    const media = await prisma.media.create({
      data: {
        filename: file.name,
        storagePath: result.path,
        url: result.url,
        bucket: STORAGE_BUCKETS.MEDIA,
        mimeType: file.type,
        size: file.size,
        width,
        height,
        type: mediaType,
        usage: parsed.data.usage || 'GENERAL',
        alt: parsed.data.alt ?? null,
        title: parsed.data.title ?? null,
        description: parsed.data.description ?? null,
        tags: parsed.data.tags,
        uploadedBy: user.id,
      },
    })

    updateTag(CACHE_TAGS.MEDIA)
    logAction(user.id, 'create', 'media', media.id)

    return createSuccess('アップロードしました', { id: media.id, url: media.url })
  } catch (error) {
    // Rollback: delete uploaded file if DB insert fails
    if (uploadedPath) {
      await deleteFile(uploadedPath, STORAGE_BUCKETS.MEDIA)
    }
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'uploadMedia', filename: file.name },
    })
    return createFailure('アップロードに失敗しました')
  }
}

/**
 * メディアメタデータ更新
 */
export async function updateMedia(
  id: string,
  data: MediaUpdateInput
): Promise<ActionResult<void>> {
  const auth = await checkPermission('media', 'update')
  if (!auth.success) return auth.error

  const user = auth.user

  const parsed = mediaUpdateSchema.safeParse(data)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const existing = await prisma.media.findUnique({
    where: { id, isActive: true },
    select: { id: true, uploadedBy: true },
  })

  if (!existing) {
    return createFailure('メディアが見つかりません')
  }

  // EDITOR can only update their own uploads
  if (isEditorRole(user.role) && existing.uploadedBy !== user.id) {
    return createFailure('このメディアを編集する権限がありません')
  }

  await prisma.media.update({
    where: { id },
    data: {
      alt: parsed.data.alt,
      title: parsed.data.title,
      description: parsed.data.description,
      tags: parsed.data.tags,
      usage: parsed.data.usage,
    },
  })

  updateTag(CACHE_TAGS.MEDIA)
  updateTag(getCacheTag.media.detail(id))
  logAction(user.id, 'update', 'media', id)

  return createSuccess('更新しました')
}

/**
 * メディア削除
 */
export async function deleteMedia(id: string): Promise<ActionResult<void>> {
  const auth = await checkPermission('media', 'delete')
  if (!auth.success) return auth.error

  const user = auth.user

  const media = await prisma.media.findUnique({
    where: { id, isActive: true },
    select: { id: true, storagePath: true },
  })

  if (!media) {
    return createFailure('メディアが見つかりません')
  }

  try {
    // Delete from storage
    const deleteResult = await deleteFile(media.storagePath, STORAGE_BUCKETS.MEDIA)
    if (!deleteResult.success) {
      logError(new Error(deleteResult.error || 'Storage delete failed'), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { operation: 'deleteMedia', mediaId: id, storagePath: media.storagePath },
      })
    }

    // Soft delete
    await prisma.media.update({
      where: { id },
      data: { isActive: false },
    })

    updateTag(CACHE_TAGS.MEDIA)
    logAction(user.id, 'delete', 'media', id)

    return createSuccess('削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteMedia', mediaId: id },
    })
    return createFailure('削除に失敗しました')
  }
}

/**
 * メディア一括削除
 */
export async function bulkDeleteMedia(
  ids: string[]
): Promise<ActionResult<{ deleted: number }>> {
  const auth = await checkPermission('media', 'delete')
  if (!auth.success) return auth.error

  const user = auth.user

  if (ids.length === 0) {
    return createSuccess('削除対象がありません', { deleted: 0 })
  }

  const mediaItems = await prisma.media.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, storagePath: true },
  })

  if (mediaItems.length === 0) {
    return createFailure('削除対象が見つかりません')
  }

  try {
    // Delete from storage
    const paths = mediaItems.map((m) => m.storagePath)
    await deleteFiles(paths, STORAGE_BUCKETS.MEDIA)

    // Soft delete
    await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    })

    updateTag(CACHE_TAGS.MEDIA)
    logAction(user.id, 'delete', 'media')

    return createSuccess(`${mediaItems.length}件のメディアを削除しました`, {
      deleted: mediaItems.length,
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'bulkDeleteMedia', count: ids.length },
    })
    return createFailure('一括削除に失敗しました')
  }
}
