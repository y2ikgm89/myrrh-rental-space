'use server'

/**
 * メディア管理 Server Actions
 */

import { revalidatePath } from 'next/cache'
import { prisma, Role, Prisma } from '@/shared/lib/prisma'
import { STORAGE_BUCKETS } from '@/shared/lib/supabase'
import { uploadFile, deleteFile, deleteFiles } from '@/shared/lib/storage'
import {
  withPermission,
  createSuccess,
  createFailure,
} from '@/admin/types/server-actions'
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
import { getSession, getSessionUser } from '@/shared/lib/auth'
import { hasPermission, canAccessAdmin } from '@/admin/lib/permissions'

// =============================================================================
// Types
// =============================================================================

export type MediaData = {
  id: string
  filename: string
  url: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  type: string
  usage: string
  alt: string | null
  title: string | null
  description: string | null
  tags: string[]
  createdAt: Date
  updatedAt: Date
  uploader: {
    id: string
    name: string
  }
}

export type GetMediaResult = {
  items: MediaData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// =============================================================================
// Helper Functions
// =============================================================================

async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  const user = getSessionUser(session)
  if (!user) return false
  if (!canAccessAdmin(user.role)) return false
  return hasPermission(user.role, 'media', 'read')
}

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
    tags: media.tags as string[],
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

  const validatedFilters = mediaFiltersSchema.parse(filters)
  const validatedPagination = mediaPaginationSchema.parse(pagination)

  const { page, limit } = validatedPagination
  const skip = (page - 1) * limit

  // Build where clause
  const where: Prisma.MediaWhereInput = {
    isActive: true,
  }

  if (validatedFilters.type) {
    where.type = validatedFilters.type
  }

  if (validatedFilters.usage) {
    where.usage = validatedFilters.usage
  }

  if (validatedFilters.mimeType) {
    where.mimeType = { contains: validatedFilters.mimeType }
  }

  if (validatedFilters.search) {
    where.OR = [
      { filename: { contains: validatedFilters.search, mode: 'insensitive' } },
      { title: { contains: validatedFilters.search, mode: 'insensitive' } },
      { alt: { contains: validatedFilters.search, mode: 'insensitive' } },
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
export const uploadMedia = withPermission<[FormData], { id: string; url: string }>(
  'media',
  'create'
)(async (user, formData: FormData) => {
  const file = formData.get('file') as File | null
  if (!file) {
    return createFailure('ファイルが選択されていません')
  }

  // Parse metadata from form
  const typeValue = formData.get('type') as string | null
  const usageValue = formData.get('usage') as string | null
  const metadata = {
    type: typeValue || undefined,
    usage: usageValue || undefined,
    alt: (formData.get('alt') as string) || undefined,
    title: (formData.get('title') as string) || undefined,
    description: (formData.get('description') as string) || undefined,
    tags: formData.get('tags') ? JSON.parse(formData.get('tags') as string) : [],
  }

  // Validate metadata
  const parsed = mediaUploadSchema.safeParse(metadata)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
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

    // Note: Image dimensions can be extracted using sharp if needed
    // For now, we skip dimension extraction
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

    revalidatePath('/admin/media')

    return createSuccess('アップロードしました', { id: media.id, url: media.url })
  } catch (error) {
    // Rollback: delete uploaded file if DB insert fails
    if (uploadedPath) {
      await deleteFile(uploadedPath, STORAGE_BUCKETS.MEDIA)
    }
    console.error('Media upload error:', error)
    return createFailure('アップロードに失敗しました')
  }
})

/**
 * メディアメタデータ更新
 */
export const updateMedia = withPermission<[string, MediaUpdateInput], void>(
  'media',
  'update'
)(async (user, id: string, data: MediaUpdateInput) => {
  const parsed = mediaUpdateSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existing = await prisma.media.findUnique({
    where: { id, isActive: true },
  })

  if (!existing) {
    return createFailure('メディアが見つかりません')
  }

  // EDITOR can only update their own uploads
  if (user.role === Role.EDITOR && existing.uploadedBy !== user.id) {
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

  revalidatePath('/admin/media')
  revalidatePath(`/admin/media/${id}`)

  return createSuccess('更新しました')
})

/**
 * メディア削除
 */
export const deleteMedia = withPermission<[string], void>(
  'media',
  'delete'
)(async (user, id: string) => {
  const media = await prisma.media.findUnique({
    where: { id, isActive: true },
  })

  if (!media) {
    return createFailure('メディアが見つかりません')
  }

  try {
    // Delete from storage
    const deleteResult = await deleteFile(media.storagePath, STORAGE_BUCKETS.MEDIA)
    if (!deleteResult.success) {
      console.warn('Storage delete warning:', deleteResult.error)
      // Continue with soft delete even if storage delete fails
    }

    // Soft delete
    await prisma.media.update({
      where: { id },
      data: { isActive: false },
    })

    revalidatePath('/admin/media')

    return createSuccess('削除しました')
  } catch (error) {
    console.error('Media delete error:', error)
    return createFailure('削除に失敗しました')
  }
})

/**
 * メディア一括削除
 */
export const bulkDeleteMedia = withPermission<[string[]], { deleted: number }>(
  'media',
  'delete'
)(async (user, ids: string[]) => {
  if (ids.length === 0) {
    return createSuccess('削除対象がありません', { deleted: 0 })
  }

  const mediaItems = await prisma.media.findMany({
    where: { id: { in: ids }, isActive: true },
  }) as Array<{ id: string; storagePath: string }>

  if (mediaItems.length === 0) {
    return createFailure('削除対象が見つかりません')
  }

  try {
    // Delete from storage
    const paths = mediaItems.map((m: { storagePath: string }) => m.storagePath)
    await deleteFiles(paths, STORAGE_BUCKETS.MEDIA)

    // Soft delete
    await prisma.media.updateMany({
      where: { id: { in: ids } },
      data: { isActive: false },
    })

    revalidatePath('/admin/media')

    return createSuccess(`${mediaItems.length}件のメディアを削除しました`, {
      deleted: mediaItems.length,
    })
  } catch (error) {
    console.error('Bulk delete error:', error)
    return createFailure('一括削除に失敗しました')
  }
})
