/**
 * Next.js 16 Proxy（ルート保護）
 *
 * Better Auth セッション検証とルート保護
 * Next.js 16 では middleware.ts ではなく proxy.ts を使用
 *
 * ログインページへのアクセスはシークレットトークンまたはワンタイムトークンで制限
 * 環境変数 ADMIN_LOGIN_TOKEN は本番環境で必須
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'
import { prisma } from '@/shared/lib/prisma'
import { loginTokenSchema } from '@/admin/lib/validations/auth'
import { logger } from '@/shared/lib/logger'
import { apiRateLimiter, getClientIp } from '@/shared/lib/rate-limit'
import { serverEnv } from '@/shared/lib/env/server'

/**
 * ADMIN_LOGIN_TOKEN を取得
 *
 * 本番環境では必須（env/server.ts で検証済み）
 * 開発環境では未設定でもフォールバック値を使用
 */
function getAdminLoginToken(): string {
  const token = serverEnv.ADMIN_LOGIN_TOKEN
  if (token) return token

  // 開発環境でのフォールバック（本番では到達しない）
  if (serverEnv.NODE_ENV === 'development') {
    return 'dev-token-for-local-development-only'
  }

  // 本番環境では env/server.ts で既にエラーがスローされているはず
  throw new Error('ADMIN_LOGIN_TOKEN is required in production')
}

// 投稿URLの予約済みサブパス
const POST_RESERVED_SUBPATHS = new Set(['category', 'tag'])

// =============================================================================
// URL Prefix Settings Cache
// =============================================================================

type PermalinkSettings = {
  postUrlPrefixEnabled: boolean
}

let settingsCache: PermalinkSettings | null = null
let settingsCacheTime = 0
const CACHE_TTL = 60 * 1000 // 1分

/**
 * パーマリンク設定を取得（キャッシュ付き）
 */
async function getPermalinkSettings(): Promise<PermalinkSettings> {
  const now = Date.now()

  // キャッシュが有効ならそれを返す
  if (settingsCache && now - settingsCacheTime < CACHE_TTL) {
    return settingsCache
  }

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: { postUrlPrefixEnabled: true },
    })

    settingsCache = {
      postUrlPrefixEnabled: settings?.postUrlPrefixEnabled ?? true,
    }
    settingsCacheTime = now
    return settingsCache
  } catch {
    // エラー時はデフォルト値を使用
    return { postUrlPrefixEnabled: true }
  }
}

// =============================================================================
// Static Routes (excluded from prefix rewrite)
// =============================================================================

/**
 * 静的ルート（プレフィックスリライト対象外）
 */
const STATIC_ROUTES = new Set([
  '',
  'about',
  'contact',
  'faq',
  'news',
  'reservation',
  'spaces',
  'terms',
  'privacy',
  'posts',
  'p',
  'admin',
  'api',
  '_next',
  'sitemap.xml',
  'robots.txt',
  'favicon.ico',
])

/**
 * 動的ルートのプレフィックス
 */
const DYNAMIC_PREFIXES = [
  'news/',
  'spaces/',
  'posts/',
  'p/',
  'admin/',
  'api/',
  '_next/',
  'category/',
  'tag/',
]

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl

  // ヘッダーにパス名を設定（Server Componentで使用）
  const createResponse = () => {
    const response = NextResponse.next()
    response.headers.set('x-pathname', pathname)
    return response
  }

  // ==========================================================================
  // ルートレベルURLのリライト（プレフィックス無効時）
  // ==========================================================================

  // 静的ファイルとAPIはスキップ
  const shouldCheckRootRewrite = !(
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  )

  if (shouldCheckRootRewrite) {
    const segments = pathname.split('/').filter(Boolean)
    const firstSegment = segments[0] ?? ''

    // 静的ルートでも動的プレフィックスでもない場合
    const isStaticRoute = STATIC_ROUTES.has(firstSegment)
    const hasDynamicPrefix = DYNAMIC_PREFIXES.some((prefix) =>
      pathname.startsWith(`/${prefix}`)
    )

    if (!isStaticRoute && !hasDynamicPrefix) {
      // ルートレベルの未知のパス（例: /article-slug, /2026/01/article-slug）
      const settings = await getPermalinkSettings()

      if (!settings.postUrlPrefixEnabled) {
        // プレフィックス無効時: /posts/ にリライト
        const url = req.nextUrl.clone()
        url.pathname = `/posts${pathname}`
        return NextResponse.rewrite(url)
      }
    }
  }

  // ==========================================================================
  // 投稿URLのリライト処理（パーマリンク構造対応）
  // ==========================================================================
  if (pathname.startsWith('/posts/')) {
    const segments = pathname.split('/').filter(Boolean)

    // /posts/[slug] - 2セグメント: 既存ルートで処理
    if (segments.length === 2) {
      return createResponse()
    }

    // /posts/category/[slug] または /posts/tag/[slug]: 既存ルートで処理
    const seg1 = segments[1]
    if (segments.length === 3 && seg1 && POST_RESERVED_SUBPATHS.has(seg1)) {
      return createResponse()
    }

    // category_name構造: /posts/[category]/[slug] → /posts/[slug]
    // Note: POST_RESERVED_SUBPATHS は上で既にチェック済み
    const seg2 = segments[2]
    if (segments.length === 3 && seg2) {
      const url = req.nextUrl.clone()
      url.pathname = `/posts/${seg2}`
      return NextResponse.rewrite(url)
    }

    // date_name構造: /posts/[year]/[month]/[slug] → /posts/[slug]
    if (segments.length === 4) {
      const year = segments[1]
      const month = segments[2]
      const slug = segments[3]

      if (year && month && slug &&
        /^\d{4}$/.test(year) &&
        /^\d{1,2}$/.test(month) &&
        parseInt(year, 10) >= 2000 &&
        parseInt(year, 10) <= 2100 &&
        parseInt(month, 10) >= 1 &&
        parseInt(month, 10) <= 12
      ) {
        const url = req.nextUrl.clone()
        url.pathname = `/posts/${slug}`
        return NextResponse.rewrite(url)
      }
    }
  }

  // API Routes の保護
  if (pathname.startsWith('/api')) {
    // レート制限（Webhooks と CRON は除外）
    if (!pathname.startsWith('/api/webhooks') && !pathname.startsWith('/api/cron')) {
      const clientIp = getClientIp(req)
      const rateLimitResult = apiRateLimiter.check(clientIp)

      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Too many requests' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(rateLimitResult.reset),
              'Retry-After': String(Math.ceil((rateLimitResult.reset - Date.now()) / 1000)),
            },
          }
        )
      }
    }

    // CRON エンドポイント: CRON_SECRET 検証
    if (pathname.startsWith('/api/cron')) {
      const authHeader = req.headers.get('authorization')
      const cronSecret = process.env.CRON_SECRET

      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }
    }

    // Webhooks: シグネチャ検証はルートハンドラ内で実施
    // ここではパススルー

    return createResponse()
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
      if (token === getAdminLoginToken()) {
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
        logger.error('Error checking login token', { error: error instanceof Error ? error.message : String(error) })
      }

      // トークンが無効な場合は404を返す（存在しないページとして扱う）
      return new NextResponse(null, { status: 404 })
    }

    // Better Auth セッションクッキーのチェック（高速な初期チェック）
    const sessionCookie = getSessionCookie(req)

    // 未認証の場合はログインページへリダイレクト（トークン付きURL）
    if (!sessionCookie) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('token', getAdminLoginToken())
      return NextResponse.redirect(loginUrl)
    }

    // Note: ロールチェックはServer ComponentまたはServer Actionで実施
    // proxy では Cookie の存在のみを確認（パフォーマンス優先）
    // 詳細な検証は auth.api.getSession() を使用するページで実施

    // ログイン成功後、URLパラメータにトークンがある場合は有効期限を延長
    const token = searchParams.get('token')
    if (token && token !== getAdminLoginToken()) {
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
              logger.error('Error updating token expiration', { error: error instanceof Error ? error.message : String(error) })
            })
        }
      } catch (error: unknown) {
        // エラーは無視（ログインは成功しているため）
        logger.error('Error extending token expiration', { error: error instanceof Error ? error.message : String(error) })
      }
    }
  }

  return createResponse()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (robots.txt, sitemap.xml, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
