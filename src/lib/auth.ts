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
import type { Adapter } from 'next-auth/adapters'

/**
 * Auth.js 設定
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma) as Adapter,
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const email = credentials.email as string
        const password = credentials.password as string

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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role: Role }).role
      }
      return token
    },
    /**
     * セッションにカスタムデータを追加
     */
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as Role
      }
      return session
    },
  },
  trustHost: true,
})

/**
 * 現在のユーザーを取得（Server Component用）
 */
export async function getCurrentUser() {
  const session = await auth()
  return session?.user
}

/**
 * 管理者権限チェック
 */
export async function isAdmin() {
  const user = await getCurrentUser()
  return user?.role === 'ADMIN'
}

/**
 * 認証必須のページ用ヘルパー
 */
export async function requireAuth() {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user
}

/**
 * 管理者権限必須のページ用ヘルパー
 */
export async function requireAdmin() {
  const user = await requireAuth()
  if (user.role !== 'ADMIN') {
    throw new Error('Forbidden')
  }
  return user
}
