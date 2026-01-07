/**
 * Next.js 16 Proxy（ルート保護）
 *
 * JWT検証とルート保護を行う
 * Next.js 16 では middleware.ts ではなく proxy.ts を使用
 * Auth.js 5 の推奨パターン: auth() をラッパーとして使用
 */

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // 管理画面の保護
  if (pathname.startsWith('/admin')) {
    // ログインページはスキップ
    if (pathname === '/admin/login') {
      return NextResponse.next()
    }

    // 未認証の場合はログインページへリダイレクト
    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }

    // ロールベースアクセス制御（ADMIN のみ管理画面にアクセス可能）
    if (session.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*'],
}
