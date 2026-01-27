/**
 * スペース選択用API（管理画面）
 *
 * エディタなどのクライアントコンポーネントから参照するため、
 * Server Actions を直接 import せず Route Handler 経由で提供する。
 */

import { NextResponse } from 'next/server'
import { checkPermission } from '@/admin/lib/action-auth'
import { getSpacesForSelect } from '@/admin/actions/space'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'

function getErrorStatus(message: string): number {
  if (message.includes('ログイン') || message.includes('権限')) {
    return 403
  }
  return 400
}

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await checkPermission('space', 'read')
    if (!auth.success) {
      return NextResponse.json(
        { success: false, error: auth.error.error },
        { status: getErrorStatus(auth.error.error) }
      )
    }

    const result = await getSpacesForSelect()
    const status = result.success ? 200 : getErrorStatus(result.error)
    return NextResponse.json(result, { status })
  } catch (error: unknown) {
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
