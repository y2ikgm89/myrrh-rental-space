/**
 * 管理画面ログインゲート用トークン生成API
 *
 * 管理者がスタッフにログインURLを共有するための署名付きトークンを生成します。
 * トークンは30日間有効で、Proxy で stateless に検証されます。
 *
 * ## 機能
 * - トークン生成（POST）
 * - アクティブなトークン一覧取得（GET）
 *
 * @module api/admin/login-tokens
 */

import { NextResponse } from 'next/server'
import { getSession, getRoleFromSession } from '@/shared/lib/auth'
import { createAdminLoginTokenRecord } from '@/shared/domain/admin-login-tokens/commands'
import { getActiveAdminLoginTokens } from '@/shared/domain/admin-login-tokens/queries'
import { getAppUrl } from '@/shared/lib/constants'
import { createAdminGateToken } from '@/shared/lib/admin-login-gate'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors/server'
import { isAdminRole, isSuperAdminRole } from '@/admin/lib/role-guards'

/**
 * 署名付きログイントークンを生成
 */
export async function POST(): Promise<NextResponse> {
  try {
    // 認証チェック
    const session = await getSession()
    const role = getRoleFromSession(session)
    if (!session?.user || !role || (!isAdminRole(role) && !isSuperAdminRole(role))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { token, expiresAt } = await createAdminGateToken()

    const loginToken = await createAdminLoginTokenRecord({
      token,
      createdBy: session.user.id,
      expiresAt,
    })

    // ログインURLを生成
    const loginUrl = `${getAppUrl()}/admin/login?token=${token}`

    return NextResponse.json({
      token: loginToken.token,
      loginUrl,
      expiresAt: loginToken.expiresAt.toISOString(),
    })
  } catch (error: unknown) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: 'generateLoginToken' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * アクティブなトークン一覧を取得
 */
export async function GET(): Promise<NextResponse> {
  try {
    // 認証チェック
    const session = await getSession()
    const role = getRoleFromSession(session)
    if (!session?.user || !role || (!isAdminRole(role) && !isSuperAdminRole(role))) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 有効期限が切れていないトークンを取得（有効期限内であれば複数回使用可能）
    const tokens = await getActiveAdminLoginTokens()

    return NextResponse.json({
      tokens: tokens.map((token) => ({
        id: token.id,
        createdAt: token.createdAt.toISOString(),
        expiresAt: token.expiresAt.toISOString(),
        usedAt: token.usedAt?.toISOString() || null,
      })),
    })
  } catch (error: unknown) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'fetchLoginTokens' },
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
