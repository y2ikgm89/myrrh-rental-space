/**
 * Better Auth 設定
 *
 * @see https://www.better-auth.com/docs
 *
 * - Prisma Adapter でデータベース連携
 * - 30日間セッション
 * - Credentials / Google OAuth Provider
 */

import { cache } from 'react'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { nextCookies } from 'better-auth/next-js'
import { prisma, Role } from './prisma'

/**
 * Better Auth インスタンス
 */
export const auth = betterAuth({
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

/**
 * セッション型
 */
export type Session = typeof auth.$Infer.Session
export type User = Session['user']

/**
 * セッション検証（cache()でリクエスト単位でメモ化）
 *
 * Next.js公式ベストプラクティス: Data Access Layer (DAL) パターン
 */
export const verifySession = cache(async (): Promise<User> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user) {
    redirect('/admin/login')
  }
  return session.user as User
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
  return session?.user as User | undefined
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
