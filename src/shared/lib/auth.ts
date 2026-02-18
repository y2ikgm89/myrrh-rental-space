/**
 * Better Auth 設定
 *
 * Better Authを使用した認証・セッション管理の設定と
 * セッション検証ユーティリティを提供します。
 *
 * ## 機能
 * - **Prisma Adapter**: データベース連携
 * - **30日間セッション**: 自動更新対応
 * - **複数認証方式**: Email/Password、Google OAuth
 * - **監査ログ**: ログイン成功/失敗の自動記録
 *
 * ## 遅延非同期初期化パターン
 * Better Auth の `betterAuth()` はモジュールロード時に同期的にシングルトン生成される。
 * Google OAuth 資格情報は DB に保存されるため非同期読取が必要。
 *
 * - `baseAuth`: 型推論専用（socialProviders なしで同期生成）
 * - `getAuth()`: 実リクエスト用（DB から資格情報を読み、キャッシュ済みインスタンスを返す）
 * - `resetAuthInstance()`: 管理画面で設定変更時にキャッシュ破棄
 *
 * 開発環境のホットリロード時も単一インスタンスを維持し、
 * AsyncLocalStorage の重複初期化警告を回避
 *
 * @see https://www.better-auth.com/docs
 * @module shared/lib/auth
 */

import 'server-only'

import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { betterAuth } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { prisma, Role } from './prisma'
import { AuditAction } from '@/shared/generated/prisma/enums'
import { SESSION_CONFIG, getAppUrl } from './constants'
import { isRecord } from './serialize'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from './errors'
import type { GoogleOAuthCredentials } from './google-oauth-credentials'

/**
 * 監査ログを記録（非同期、失敗無視）
 */
async function logAuthEvent(
  action: AuditAction,
  userId: string | undefined,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: 'auth',
        metadata: JSON.parse(JSON.stringify(metadata)),
      },
    })
  } catch (error) {
    // ログ記録失敗は無視（本番ではSentry等に送信推奨）
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'createAuthAuditLog', action, userId },
    })
  }
}

/**
 * Better Auth インスタンス作成関数
 *
 * @param credentials - Google OAuth 資格情報（nullの場合はsocialProvidersなし）
 */
function createAuth(credentials?: GoogleOAuthCredentials | null) {
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    session: {
      expiresIn: SESSION_CONFIG.expiresIn,
      updateAge: SESSION_CONFIG.updateAge,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_CONFIG.cookieCacheMaxAge,
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    ...(credentials
      ? {
          socialProviders: {
            google: {
              clientId: credentials.clientId,
              clientSecret: credentials.clientSecret,
              scope: [
                'openid',
                'email',
                'profile',
                'https://www.googleapis.com/auth/calendar.events',
              ],
            },
          },
        }
      : {}),
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: Role.USER,
          input: false,
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        // ログイン成功時の監査ログ
        if (ctx.path.startsWith('/sign-in') && ctx.context.newSession) {
          const { user } = ctx.context.newSession
          void logAuthEvent(AuditAction.LOGIN_SUCCESS, user.id, {
            email: user.email,
            provider: ctx.path.includes('social') ? 'google' : 'email',
          })
        }
      }),
    },
    plugins: [nextCookies()],
    trustedOrigins: [process.env["BETTER_AUTH_URL"] ?? getAppUrl()],
  })
}

/**
 * Better Auth インスタンスの型（インスタンス生成なしで型推論）
 *
 * `ReturnType<typeof createAuth>` で関数の戻り値型を取得し、
 * indexed access type で `$Infer` にアクセス。
 * モジュールロード時の不要な副作用（DB接続等）を回避。
 */
type AuthInstance = ReturnType<typeof createAuth>

// グローバル変数の型定義
declare global {
  var authInstance: AuthInstance | undefined
}

const globalForAuth = globalThis

/**
 * Better Auth インスタンスを非同期で取得（遅延初期化）
 *
 * DB から Google OAuth 資格情報を読み、キャッシュ済みインスタンスを返す。
 * 初回呼出し時のみ DB 読取が発生し、以降はキャッシュを使用。
 */
export async function getAuth(): Promise<AuthInstance> {
  if (globalForAuth.authInstance) {
    return globalForAuth.authInstance
  }

  let credentials: GoogleOAuthCredentials | null = null
  try {
    // 動的インポートでcircular dependency回避
    const { getGoogleOAuthCredentials } = await import('./google-oauth-credentials')
    credentials = await getGoogleOAuthCredentials()
  } catch (error) {
    // ビルド時やDB不可の場合はcredentialsなしで初期化
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getAuth', note: 'initializing without Google OAuth' },
    })
  }

  const instance = createAuth(credentials)
  globalForAuth.authInstance = instance
  return instance
}

/**
 * Auth インスタンスのキャッシュを破棄
 *
 * 管理画面で Google OAuth 設定を変更した後に呼び出し、
 * 次回リクエストで新しい資格情報で再構築させる。
 */
export function resetAuthInstance(): void {
  globalForAuth.authInstance = undefined
}

/**
 * セッション型
 */
export type Session = AuthInstance['$Infer']['Session']

/**
 * Better Auth のユーザー型（role を Role enum に変換）
 *
 * Better Auth の additionalFields は string 型で定義されるため、
 * 内部で Role enum にキャストしたカスタム型を使用
 */
export type User = Omit<Session['user'], 'role'> & {
  role: Role
}

/**
 * セッションユーザー型ガード
 *
 * Better Authのセッションからユーザーを型安全に取得
 */
function isValidSessionUser(user: unknown): user is Session['user'] {
  if (!isRecord(user)) return false
  if (!('id' in user) || !('email' in user) || !('role' in user)) return false
  return typeof user['id'] === 'string' && typeof user['email'] === 'string'
}

/**
 * 有効なRoleのSet（O(1) lookup用）
 */
const VALID_ROLES = new Set<string>(Object.values(Role))

/**
 * role が有効な Role enum 値か検証
 */
export function isValidRole(role: string): role is Role {
  return VALID_ROLES.has(role)
}

/**
 * セッションからRoleを型安全に取得
 *
 * Server Actionsなどで session.user.role を直接使用する場合のヘルパー
 */
export function getRoleFromSession(session: Session | null): Role | null {
  if (!session?.user?.role) return null
  return isValidRole(session.user.role) ? session.user.role : null
}

/**
 * セッションからユーザーを取得（型安全）
 *
 * Better Auth の string 型 role を Role enum にキャストして返す
 */
export function getSessionUser(session: Session | null): User | null {
  if (!session?.user || !isValidSessionUser(session.user)) {
    return null
  }
  const { role, ...rest } = session.user
  if (!isValidRole(role)) {
    return null
  }
  return { ...rest, role }
}

/**
 * セッション検証（cache()でリクエスト単位でメモ化）
 *
 * Next.js公式ベストプラクティス: Data Access Layer (DAL) パターン
 */
export const verifySession = cache(async (): Promise<User> => {
  const auth = await getAuth()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  const user = getSessionUser(session)
  if (!user) {
    redirect('/admin/login')
  }
  return user
})

/**
 * 管理者セッション検証（cache()でメモ化）
 */
export const verifyAdminSession = cache(async (): Promise<User> => {
  const user = await verifySession()
  if (user.role !== Role.ADMIN) {
    redirect('/admin/login')
  }
  return user
})

/**
 * 現在のユーザーを取得（cache()でメモ化）
 *
 * リダイレクトなし版（オプショナル認証用）
 */
export const getCurrentUser = cache(async (): Promise<User | undefined> => {
  const auth = await getAuth()
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return getSessionUser(session) ?? undefined
})

/**
 * 管理者権限チェック（cache()でメモ化）
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser()
  return user?.role === Role.ADMIN
})

/**
 * セッション取得（キャッシュなし）
 *
 * Server Actions など cache() が適さない場所で使用
 */
export async function getSession(): Promise<Session | null> {
  const auth = await getAuth()
  return auth.api.getSession({
    headers: await headers(),
  })
}
