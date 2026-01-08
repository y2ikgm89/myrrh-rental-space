/**
 * Auth.js 5 (NextAuth v5) 設定
 *
 * - Prisma Adapter でデータベース連携
 * - JWT セッション管理
 * - Credentials Provider（メール/パスワード認証）
 */

import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from './prisma'
import { Role } from '@/generated/prisma/client/client'
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

        // TODO: パスワードハッシュの検証を実装
        // 現時点では開発用に簡易的な検証
        // 本番環境では bcrypt などを使用してハッシュ化されたパスワードと比較
        // const isValid = await bcrypt.compare(password, user.password)
        // if (!isValid) return null
        void password

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
 * 現在のユーザーを取得（Server Component用）
 */
export async function getCurrentUser(): Promise<Session['user'] | undefined> {
  const session = await auth()
  return session?.user
}

/**
 * 管理者権限チェック
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser()
  return user?.role === Role.ADMIN
}

/**
 * 認証必須のページ用ヘルパー
 */
export async function requireAuth(): Promise<Session['user']> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

/**
 * 管理者権限必須のページ用ヘルパー
 */
export async function requireAdmin(): Promise<Session['user']> {
  const user = await requireAuth()
  if (user.role !== Role.ADMIN) {
    throw new Error('Forbidden')
  }
  return user
}
