/**
 * Better Auth API Route Handler
 *
 * 遅延初期化パターン: 各リクエストで getAuth() を呼び出し、
 * DB から Google OAuth 資格情報を含む auth インスタンスを取得。
 *
 * @see https://www.better-auth.com/docs/integrations/next
 */

import { getAuth } from '@/shared/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'

export async function GET(request: Request) {
  const auth = await getAuth()
  const handler = toNextJsHandler(auth)
  return handler.GET(request)
}

export async function POST(request: Request) {
  const auth = await getAuth()
  const handler = toNextJsHandler(auth)
  return handler.POST(request)
}
