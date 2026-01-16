/**
 * Better Auth 設定
 *
 * @see https://www.better-auth.com/docs
 *
 * - Prisma Adapter でデータベース連携
 * - 30日間セッション
 * - Credentials / Google OAuth Provider
 * - シングルトンパターンで AsyncLocalStorage 警告を回避
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { prisma, Role } from './prisma'

/**
 * Better Auth インスタンス作成関数
 */
function createAuth() {
  return betterAuth({
    database: prismaAdapter(prisma, {
      provider: 'postgresql',
    }),
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // 1 day (session refresh interval)
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        scope: [
          'openid',
          'email',
          'profile',
          'https://www.googleapis.com/auth/calendar.events',
        ],
      },
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: Role.USER,
          input: false,
        },
      },
    },
    plugins: [nextCookies()],
    trustedOrigins: [process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'],
  })
}

/**
 * シングルトン用グローバル型定義
 */
const globalForAuth = globalThis as unknown as {
  auth: ReturnType<typeof createAuth> | undefined
}

/**
 * Better Auth インスタンス（シングルトン）
 *
 * 開発環境のホットリロード時も単一インスタンスを維持し、
 * AsyncLocalStorage の重複初期化警告を回避
 */
export const auth = globalForAuth.auth ?? createAuth()

if (process.env.NODE_ENV !== 'production') {
  globalForAuth.auth = auth
}

/**
 * セッション型
 */
export type Session = typeof auth.$Infer.Session

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
  return (
    typeof user === 'object' &&
    user !== null &&
    'id' in user &&
    'email' in user &&
    'role' in user &&
    typeof (user as Session['user']).id === 'string' &&
    typeof (user as Session['user']).email === 'string'
  )
}

/**
 * role が有効な Role enum 値か検証
 */
export function isValidRole(role: string): role is Role {
  return Object.values(Role).includes(role as Role)
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
  return auth.api.getSession({
    headers: await headers(),
  })
}
