/**
 * Better Auth Client SDK
 *
 * @see https://www.better-auth.com/docs/integrations/next
 *
 * クライアントサイドでの認証操作に使用
 */

import { createAuthClient } from 'better-auth/react'

/**
 * Better Auth クライアントインスタンス
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})

/**
 * 認証フック・メソッドをエクスポート
 */
export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
  $Infer,
} = authClient
