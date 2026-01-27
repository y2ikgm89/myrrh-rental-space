/**
 * メディアAPI（管理画面）
 *
 * クライアント側からの取得・アップロードをRoute Handlerで受ける。
 * Server Actionsをクライアントに直接露出しない構成にすることで、
 * Next.js 16 / Turbopack の公式推奨に沿った安定運用を優先。
 */

import { NextResponse } from 'next/server'
import { checkPermission } from '@/admin/lib/action-auth'
import { getMediaList, uploadMedia } from '@/admin/actions/media'
import {
  mediaFiltersSchema,
  mediaPaginationSchema,
  parseMediaTypeFilter,
  parseMediaUsageFilter,
} from '@/admin/lib/validations/media'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'

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
        { error: filtersResult.error.issues[0].message },
        { status: 400 }
      )
    }

    const paginationResult = mediaPaginationSchema.safeParse({ page, limit })
    if (!paginationResult.success) {
      return NextResponse.json(
        { error: paginationResult.error.issues[0].message },
        { status: 400 }
      )
    }

    const auth = await checkPermission('media', 'read')
    if (!auth.success) {
      return NextResponse.json(
        { error: auth.error.error },
        { status: getErrorStatus(auth.error.error) }
      )
    }

    const result = await getMediaList(filtersResult.data, paginationResult.data)
    return NextResponse.json(result)
  } catch (error: unknown) {
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
    const formData = await request.formData()
    const result = await uploadMedia(formData)
    const status = result.success ? 200 : getErrorStatus(result.error)
    return NextResponse.json(result, { status })
  } catch (error: unknown) {
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
