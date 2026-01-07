/**
 * Next.js 16 Proxy（ルート保護）
 *
 * JWT検証とルート保護を行う
 * Next.js 16 では middleware.ts ではなく proxy.ts を使用
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export default async function proxy(request: NextRequest) {
  const session = await auth()

  // 管理画面の保護
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // ログインページはスキップ
    if (request.nextUrl.pathname === '/admin/login') {
      return NextResponse.next()
    }

    // 未認証の場合はログインページへリダイレクト
    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    // ロールベースアクセス制御（ADMIN のみ管理画面にアクセス可能）
    if (session.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
