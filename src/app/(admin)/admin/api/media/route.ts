/**
 * メディアAPI（管理画面）
 *
 * クライアント側からの取得・アップロードを Route Handler で受ける。
 */

import { NextResponse } from 'next/server'
import { unstable_rethrow } from 'next/navigation'
import { checkPermission } from '@/admin/lib/action-auth'
import {
  inferMediaType,
  mediaFiltersSchema,
  mediaPaginationSchema,
  mediaUploadSchema,
  parseMediaTypeFilter,
  parseMediaUsageFilter,
  validateFile,
} from '@/admin/lib/validations/media'
import { uploadMediaCommand } from '@/shared/domain/media/commands'
import { getMediaListQuery } from '@/shared/domain/media/queries'
import { extractFieldErrors } from '@/shared/lib/action-helpers'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors/server'

function getErrorStatus(message: string): number {
  if (message.includes('ログイン') || message.includes('権限')) {
    return 403
  }
  return 400
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '24')

    const filtersResult = mediaFiltersSchema.safeParse({
      type: parseMediaTypeFilter(url.searchParams.get('type')),
      usage: parseMediaUsageFilter(url.searchParams.get('usage')),
      search: url.searchParams.get('search') || undefined,
      mimeType: url.searchParams.get('mimeType') || undefined,
    })

    if (!filtersResult.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', fieldErrors: extractFieldErrors(filtersResult.error) },
        { status: 400 }
      )
    }

    const paginationResult = mediaPaginationSchema.safeParse({ page, limit })
    if (!paginationResult.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', fieldErrors: extractFieldErrors(paginationResult.error) },
        { status: 400 }
      )
    }

    const auth = await checkPermission('media', 'read', request.headers)
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error.error },
        { status: getErrorStatus(auth.error.error) }
      )
    }

    const result = await getMediaListQuery(filtersResult.data, paginationResult.data)
    return NextResponse.json(result)
  } catch (error: unknown) {
    unstable_rethrow(error)
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'adminMediaGet' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission('media', 'create', request.headers)
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error.error },
        { status: getErrorStatus(auth.error.error) }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'ファイルが選択されていません' },
        { status: 400 }
      )
    }

    const rawTags = formData.get('tags')
    let tags: string[] = []
    if (typeof rawTags === 'string') {
      const parsedTags: unknown = JSON.parse(rawTags)
      if (Array.isArray(parsedTags)) {
        tags = parsedTags.filter((tag): tag is string => typeof tag === 'string')
      }
    }

    const metadataResult = mediaUploadSchema.safeParse({
      type: typeof formData.get('type') === 'string' ? formData.get('type') : undefined,
      usage: typeof formData.get('usage') === 'string' ? formData.get('usage') : undefined,
      alt: typeof formData.get('alt') === 'string' ? formData.get('alt') : undefined,
      title: typeof formData.get('title') === 'string' ? formData.get('title') : undefined,
      description:
        typeof formData.get('description') === 'string'
          ? formData.get('description')
          : undefined,
      tags,
    })

    if (!metadataResult.success) {
      return NextResponse.json(
        { error: 'バリデーションエラー', fieldErrors: extractFieldErrors(metadataResult.error) },
        { status: 400 }
      )
    }

    const type = metadataResult.data.type ?? inferMediaType(file.type)
    const validation = validateFile(file, type)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error ?? 'アップロードに失敗しました' },
        { status: 400 }
      )
    }

    const result = await uploadMediaCommand({
      file,
      folder: metadataResult.data.usage?.toLowerCase() || 'general',
      uploadedBy: auth.user.id,
      type,
      usage: metadataResult.data.usage ?? null,
      alt: metadataResult.data.alt ?? null,
      title: metadataResult.data.title ?? null,
      description: metadataResult.data.description ?? null,
      tags: metadataResult.data.tags ?? [],
    })

    return NextResponse.json(
      { success: true, data: result, message: 'アップロードしました' },
      { status: 200 }
    )
  } catch (error: unknown) {
    unstable_rethrow(error)
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'adminMediaUpload' },
    })
    return NextResponse.json(
      { success: false, error: 'アップロードに失敗しました' },
      { status: 500 }
    )
  }
}
