/**
 * Media API Route
 *
 * GET: メディア一覧取得
 * POST: メディアアップロード
 *
 * Turbopack HMR互換性のため、Server ActionsではなくAPI Routesを使用
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession, getSessionUser } from '@/shared/lib/auth'
import { prisma, Prisma } from '@/shared/lib/prisma'
import { MediaType, MediaUsage } from '@/shared/generated/prisma/client'
import { STORAGE_BUCKETS } from '@/shared/lib/supabase'
import { uploadFile } from '@/shared/lib/storage'
import { canAccessAdmin, hasPermission } from '@/admin/lib/permissions'
import { parseStringArray } from '@/shared/lib/json-validators'
import { isValidMediaType, isValidMediaUsage } from '@/shared/lib/validations/enums'
import { logError, normalizeError, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

type MediaWithUploader = Prisma.MediaGetPayload<{
  include: { uploader: { select: { id: true; name: true } } }
}>

function transformMedia(media: MediaWithUploader) {
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

/**
 * GET /api/admin/media
 * メディア一覧を取得
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  const user = getSessionUser(session)

  if (!user || !canAccessAdmin(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasPermission(user.role, 'media', 'read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '24', 10)

  const skip = (page - 1) * limit

  const where: Prisma.MediaWhereInput = {
    isActive: true,
  }

  if (type && isValidMediaType(type)) {
    where.type = type
  }

  if (search) {
    where.OR = [
      { filename: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { alt: { contains: search, mode: 'insensitive' } },
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

  return NextResponse.json({
    items: items.map(transformMedia),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  })
}

/**
 * POST /api/admin/media
 * メディアをアップロード
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  const user = getSessionUser(session)

  if (!user || !canAccessAdmin(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasPermission(user.role, 'media', 'create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // ファイルタイプの検証
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP, AVIF' },
        { status: 400 }
      )
    }

    // ファイルサイズの検証（10MB）
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size: 10MB' },
        { status: 400 }
      )
    }

    // メタデータ
    const typeStr = formData.get('type')?.toString()
    const usageStr = formData.get('usage')?.toString()
    const type: MediaType = typeStr && isValidMediaType(typeStr) ? typeStr : MediaType.IMAGE
    const usage: MediaUsage = usageStr && isValidMediaUsage(usageStr) ? usageStr : MediaUsage.GENERAL
    const alt = formData.get('alt')?.toString() || null
    const title = formData.get('title')?.toString() || null

    // Supabase Storageにアップロード
    const result = await uploadFile(file, STORAGE_BUCKETS.MEDIA, {
      folder: usage.toLowerCase(),
    })

    if (!result.success || !result.url || !result.path) {
      return NextResponse.json(
        { error: result.error || 'Upload failed' },
        { status: 500 }
      )
    }

    // DBにレコード作成
    const media = await prisma.media.create({
      data: {
        filename: file.name,
        storagePath: result.path,
        url: result.url,
        bucket: STORAGE_BUCKETS.MEDIA,
        mimeType: file.type,
        size: file.size,
        width: null,
        height: null,
        type,
        usage,
        alt,
        title,
        description: null,
        tags: [],
        uploadedBy: user.id,
      },
    })

    return NextResponse.json({
      success: true,
      id: media.id,
      url: media.url,
      filename: media.filename,
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'uploadMedia' },
    })
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
