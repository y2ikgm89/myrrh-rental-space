/**
 * Next.js 16 Proxy（ルート保護）
 *
 * Better Auth セッション検証とルート保護
 * Next.js 16 では middleware.ts ではなく proxy.ts を使用
 *
 * ログインページへのアクセスはシークレットトークンまたはワンタイムトークンで制限
 * 環境変数 ADMIN_LOGIN_TOKEN は必須（開発環境・本番環境ともに）
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { prisma } from '@/lib/prisma'
import { loginTokenSchema } from '@/lib/validations/auth'

// 環境変数の検証（起動時にチェック）
const ADMIN_LOGIN_TOKEN: string = (() => {
  const token = process.env.ADMIN_LOGIN_TOKEN
  if (!token) {
    throw new Error(
      'ADMIN_LOGIN_TOKEN environment variable is required. Please set it in your .env.local file.'
    )
  }
  return token
})()

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl

  // ヘッダーにパス名を設定（Server Componentで使用）
  const createResponse = () => {
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  }

  // 管理画面の保護
  if (pathname.startsWith('/admin')) {
    // ログインページへのアクセス制限（シークレットトークンまたはワンタイムトークン必須）
    if (pathname === '/admin/login') {
      const token = searchParams.get('token')

      if (!token) {
        return new NextResponse(null, { status: 404 })
      }

      // 環境変数のトークンと一致するかチェック
      if (token === ADMIN_LOGIN_TOKEN) {
        return createResponse()
      }

      const parsedToken = loginTokenSchema.safeParse(token)
      if (!parsedToken.success) {
        return new NextResponse(null, { status: 404 })
      }

      // ワンタイムトークンをチェック
      try {
        const loginToken = await prisma.loginToken.findUnique({
          where: { token: parsedToken.data },
        })

        // トークンが存在し、有効期限が切れていない場合
        if (loginToken && loginToken.expiresAt > new Date()) {
          return createResponse()
        }
      } catch (error: unknown) {
        // データベースエラーの場合は環境変数のトークンでフォールバック
        console.error('Error checking login token:', error)
      }

      // トークンが無効な場合は404を返す（存在しないページとして扱う）
      return new NextResponse(null, { status: 404 })
    }

    // Better Auth セッションクッキーのチェック（高速な初期チェック）
    const sessionCookie = getSessionCookie(req)

    // 未認証の場合はログインページへリダイレクト（トークン付きURL）
    if (!sessionCookie) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('token', ADMIN_LOGIN_TOKEN)
      return NextResponse.redirect(loginUrl)
    }

    // Note: ロールチェックはServer ComponentまたはServer Actionで実施
    // proxy では Cookie の存在のみを確認（パフォーマンス優先）
    // 詳細な検証は auth.api.getSession() を使用するページで実施

    // ログイン成功後、URLパラメータにトークンがある場合は有効期限を延長
    const token = searchParams.get('token')
    if (token && token !== ADMIN_LOGIN_TOKEN) {
      const parsedToken = loginTokenSchema.safeParse(token)
      if (!parsedToken.success) {
        return createResponse()
      }
      try {
        const loginToken = await prisma.loginToken.findUnique({
          where: { token: parsedToken.data },
        })

        // トークンが存在し、有効期限内の場合、有効期限を延長
        if (loginToken && loginToken.expiresAt > new Date()) {
          const newExpiresAt = new Date()
          newExpiresAt.setDate(newExpiresAt.getDate() + 30)

          // 非同期で更新（レスポンスをブロックしない）
          prisma.loginToken
            .update({
              where: { id: loginToken.id },
              data: { expiresAt: newExpiresAt },
            })
            .catch((error: unknown) => {
              console.error('Error updating token expiration:', error)
            })
        }
      } catch (error: unknown) {
        // エラーは無視（ログインは成功しているため）
        console.error('Error extending token expiration:', error)
      }
    }
  }

  return createResponse()
}

export const config = {
  matcher: ['/admin/:path*'],
}
