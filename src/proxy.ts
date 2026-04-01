/**
 * Next.js 16 Proxy
 *
 * 共通セキュリティヘッダー・レート制限・Admin Gate を担当する。
 * 公開ルーティングの解決は route 側で行う。
 */

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_GATE_COOKIE_NAME,
  getAdminGateCookieOptions,
  isSignedAdminGateToken,
  verifyAdminGateToken,
} from "@/shared/lib/admin-login-gate";
import { serverEnv } from "@/shared/lib/env/server";
import { checkRateLimit, getClientIp } from "@/shared/lib/rate-limit";

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
];

function buildCsp(nonce: string): string {
  const isDev = serverEnv.NODE_ENV === "development";
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`};
    img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://images.unsplash.com;
    font-src 'self';
    connect-src 'self' https://*.supabase.co https://api.stripe.com https://unpkg.com https://www.google-analytics.com https://analytics.google.com${isDev ? " ws://localhost:*" : ""};
    frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://www.figma.com https://www.instagram.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applySecurityHeaders(headers: Headers, csp: string): void {
  for (const [key, value] of SECURITY_HEADERS) {
    headers.set(key, value);
  }
  headers.set("Content-Security-Policy", csp);
}

function createResponse(req: NextRequest, pathname: string): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspValue = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("Content-Security-Policy", cspValue);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-pathname", pathname);
  applySecurityHeaders(response.headers, cspValue);
  return response;
}

// ---------------------------------------------------------------------------
// Admin Gate: /admin/login のアクセス制御
//
// 以下のいずれかを満たす場合のみログインページを表示:
// 1. admin-gate cookie が設定済み（過去にトークン検証済み）
// 2. セッション cookie が存在（既にログイン済み）
// 3. ?token= パラメータで有効なトークンを提示（初回アクセス）
// ---------------------------------------------------------------------------

async function handleAdminLoginGate(
  req: NextRequest,
  pathname: string,
): Promise<NextResponse> {
  const sessionCookie = getSessionCookie(req);
  const gateCookie = req.cookies.get(ADMIN_GATE_COOKIE_NAME);

  // 既に gate cookie またはセッションがある → 通過
  if (gateCookie?.value === "1" || sessionCookie) {
    return createResponse(req, pathname);
  }

  // ?token= パラメータでトークン検証
  const token = req.nextUrl.searchParams.get("token");
  if (token && isSignedAdminGateToken(token)) {
    if (await verifyAdminGateToken(token)) {
      // トークン有効 → DB 消費は dynamic import（proxy.ts は Edge 互換を維持）
      const { consumeAdminLoginToken } =
        await import("@/shared/domain/admin-login-tokens/commands");
      const consumed = await consumeAdminLoginToken(token);
      if (consumed) {
        // cookie 設定 + token パラメータを除去してリダイレクト
        const cleanUrl = new URL("/admin/login", req.url);
        const response = NextResponse.redirect(cleanUrl);
        response.cookies.set(
          ADMIN_GATE_COOKIE_NAME,
          "1",
          getAdminGateCookieOptions(),
        );
        return response;
      }
    }
  }

  // いずれの条件も満たさない → 404
  return new NextResponse(null, { status: 404 });
}

// ---------------------------------------------------------------------------
// Main proxy
// ---------------------------------------------------------------------------

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api")) {
    if (
      !pathname.startsWith("/api/webhooks") &&
      !pathname.startsWith("/api/cron")
    ) {
      const clientIp = getClientIp(req);
      const rateLimitResult = checkRateLimit(pathname, clientIp);

      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: "Too many requests" },
          {
            status: 429,
            headers: {
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(rateLimitResult.reset),
              "Retry-After": String(
                Math.ceil((rateLimitResult.reset - Date.now()) / 1000),
              ),
            },
          },
        );
      }
    }

    if (pathname.startsWith("/api/cron")) {
      const authHeader = req.headers.get("authorization");
      const cronSecret = serverEnv.CRON_SECRET;

      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    return createResponse(req, pathname);
  }

  if (pathname.startsWith("/admin")) {
    // Admin Gate: ログインページの隠蔽
    if (pathname === "/admin/login") {
      return handleAdminLoginGate(req, pathname);
    }

    // セットアップページは認証不要
    if (pathname.startsWith("/admin/setup/")) {
      return createResponse(req, pathname);
    }

    // その他の管理画面: セッション必須
    const sessionCookie = getSessionCookie(req);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  return createResponse(req, pathname);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)",
  ],
};
