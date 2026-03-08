/**
 * スペース選択用API（管理画面）
 *
 * エディタなどのクライアントコンポーネントから参照するため、
 * Route Handler 経由で提供する。
 */

import { NextResponse } from 'next/server'
import { unstable_rethrow } from 'next/navigation'
import { checkPermission } from '@/admin/lib/action-auth'
import { createSuccess } from '@/admin/types/server-actions'
import { getSpacesForSelectQuery } from '@/shared/domain/spaces/queries'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors/server'

function getErrorStatus(message: string): number {
  if (message.includes('ログイン') || message.includes('権限')) {
    return 403
  }
  return 400
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const auth = await checkPermission('space', 'read', request.headers)
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error.error },
        { status: getErrorStatus(auth.error.error) }
      )
    }

    const result = createSuccess('取得しました', await getSpacesForSelectQuery())
    return NextResponse.json(result)
  } catch (error: unknown) {
    unstable_rethrow(error)
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'adminSpacesSelect' },
    })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
