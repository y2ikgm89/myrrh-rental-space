/**
 * Auth.js 5 (NextAuth v5) 設定
 *
 * - Prisma Adapter でデータベース連携
 * - JWT セッション管理
 * - Credentials Provider（メール/パスワード認証）
 */

import { cache } from 'react'
import { redirect } from 'next/navigation'
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcrypt'
import { prisma } from './prisma'
import { Role } from '@/generated/prisma/client/enums'
import {
  authTokenSchema,
  authUserSchema,
  credentialsSchema,
} from '@/lib/validations/auth'
import type { Session } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import type { User } from '@/generated/prisma/client/client'

/**
 * Auth.js 設定
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(
        credentials: Partial<Record<'email' | 'password', unknown>>,
        request: Request
      ): Promise<Pick<User, 'id' | 'email' | 'name' | 'role'> | null> {
        const parsedCredentials = credentialsSchema.safeParse(
          credentials ?? {}
        )
        if (!parsedCredentials.success) {
          return null
        }
        void request

        const { email, password } = parsedCredentials.data

        // ユーザーを検索
        const user = await prisma.user.findUnique({
          where: { email },
        })

        if (!user) {
          return null
        }

        // パスワードが設定されていない場合は認証失敗
        if (!user.password) {
          return null
        }

        // bcryptでパスワードを検証
        const isValid = await bcrypt.compare(password, user.password)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    /**
     * JWT トークンにカスタムデータを追加
     */
    async jwt({ token, user }: { token: JWT; user?: unknown }): Promise<JWT> {
      const parsedUser = authUserSchema.safeParse(user)
      if (parsedUser.success) {
        token.id = parsedUser.data.id
        token.role = parsedUser.data.role
      }
      return token
    },
    /**
     * セッションにカスタムデータを追加
     */
    async session({
      session,
      token,
    }: {
      session: Session
      token: JWT
    }): Promise<Session> {
      const parsedToken = authTokenSchema.safeParse(token)
      if (parsedToken.success && session.user) {
        session.user.id = parsedToken.data.id
        session.user.role = parsedToken.data.role
      }
      return session
    },
  },
  trustHost: true,
})

/**
 * セッション検証（cache()でリクエスト単位でメモ化）
 *
 * Next.js公式ベストプラクティス: Data Access Layer (DAL) パターン
 * - 同一リクエスト内で複数回呼び出されても1回のみ実行
 * - 未認証時は自動的にログインページへリダイレクト
 */
export const verifySession = cache(async (): Promise<Session['user']> => {
  const session = await auth()
  if (!session?.user) {
    redirect('/admin/login')
  }
  return session.user
})

/**
 * 管理者セッション検証（cache()でリクエスト単位でメモ化）
 *
 * - verifySession()を内部で呼び出し（キャッシュ済み）
 * - 非管理者は自動的にログインページへリダイレクト
 */
export const verifyAdminSession = cache(async (): Promise<Session['user']> => {
  const user = await verifySession()
  if (user.role !== Role.ADMIN) {
    redirect('/admin/login')
  }
  return user
})

/**
 * 現在のユーザーを取得（cache()でメモ化）
 *
 * - リダイレクトなし版（オプショナル認証用）
 * - 未認証の場合はundefinedを返す
 */
export const getCurrentUser = cache(
  async (): Promise<Session['user'] | undefined> => {
    const session = await auth()
    return session?.user
  }
)

/**
 * 管理者権限チェック（cache()でメモ化）
 */
export const isAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser()
  return user?.role === Role.ADMIN
})

/**
 * @deprecated verifySession()を使用してください
 */
export const requireAuth = verifySession

/**
 * @deprecated verifyAdminSession()を使用してください
 */
export const requireAdmin = verifyAdminSession
