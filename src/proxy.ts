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
  isSignedAdminGateToken,
} from "@/shared/lib/admin-login-gate";
import { serverEnv } from "@/shared/lib/env/server";
import { checkRateLimit, getClientIp } from "@/shared/lib/rate-limit";

/**
 * Timing-safe string comparison to prevent timing attacks on secret tokens.
 * Uses Web Crypto API (available in Edge/Node.js middleware).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  // crypto.subtle.timingSafeEqual is not available in all runtimes;
  // fall back to constant-time XOR comparison
  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  }
  return result === 0;
}

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
];

function resolveFrameAncestors(pathname: string): string {
  if (pathname.startsWith("/preview/")) {
    return "'self'";
  }

  return "'none'";
}

function getConfiguredMediaSource(): string | null {
  const publicUrl = serverEnv.R2_PUBLIC_URL;
  if (!publicUrl) return null;

  try {
    return new URL(publicUrl).origin;
  } catch {
    return null;
  }
}

function buildCsp(nonce: string, pathname: string): string {
  const isDev = serverEnv.NODE_ENV === "development";
  const mediaSource = getConfiguredMediaSource();
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`};
    img-src 'self' data: blob:${mediaSource ? ` ${mediaSource}` : ""} https://*.r2.dev https://img.youtube.com https://*.cdninstagram.com https://*.fbcdn.net;
    font-src 'self';
    connect-src 'self' https://api.stripe.com https://unpkg.com https://www.google-analytics.com https://analytics.google.com${isDev ? " ws://localhost:*" : ""};
    frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://www.figma.com https://www.instagram.com https://www.google.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors ${resolveFrameAncestors(pathname)};
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
  const cspValue = buildCsp(nonce, pathname);
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
// 2. ?token= パラメータ付きの初回アクセスは Node.js Route Handler へ委譲
//
// セッション cookie の存在だけでは通過させない。公開サイトのソーシャル
// ログイン（CUSTOMER ロール）でもセッション cookie は発行されるため、
// gate cookie なしではログインフォームを表示しない。
// ---------------------------------------------------------------------------

function handleAdminLoginGate(
  req: NextRequest,
  pathname: string,
): NextResponse {
  const gateCookie = req.cookies.get(ADMIN_GATE_COOKIE_NAME);

  // gate cookie がある → 通過
  if (gateCookie?.value === "1") {
    return createResponse(req, pathname);
  }

  // DB-backed 検証と消費は Node.js Route Handler に委譲する
  const token = req.nextUrl.searchParams.get("token");
  if (token && isSignedAdminGateToken(token)) {
    const consumeUrl = new URL("/admin/login/consume", req.url);
    consumeUrl.searchParams.set("token", token);
    return NextResponse.redirect(consumeUrl);
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
    // Cloud Run の health / liveness probe は x-forwarded-for を設定しないため、
    // getClientIp() が "unknown" を返し全 probe が同一 bucket に合算される。
    // burst 時に apiRateLimiter (100/min) を超過すると 429 → probe 失敗 → コンテナ kill の silent bug。
    // webhook / cron と同様に rate-limit 対象外。
    const isProbeOrInfraEndpoint =
      pathname === "/api/live" || pathname === "/api/health";

    if (
      !pathname.startsWith("/api/webhooks") &&
      !pathname.startsWith("/api/cron") &&
      !isProbeOrInfraEndpoint
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
      const cronSecret = serverEnv.CRON_SECRET;

      // 本番では CRON_SECRET 必須（validateProductionEnv で起動時チェック済み）
      // 非本番でも未設定時は拒否（staging 環境のセキュリティ確保）
      if (!cronSecret) {
        if (process.env["NODE_ENV"] === "production") {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // 開発環境: CRON_SECRET 未設定時のみ認証スキップ
      } else {
        const authHeader = req.headers.get("authorization");
        const expected = `Bearer ${cronSecret}`;
        if (!authHeader || !timingSafeEqual(authHeader, expected)) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      }
    }

    return createResponse(req, pathname);
  }

  if (pathname.startsWith("/admin")) {
    // Admin Gate: ログインページの隠蔽
    if (pathname === "/admin/login") {
      return handleAdminLoginGate(req, pathname);
    }

    if (pathname === "/admin/login/consume") {
      return createResponse(req, pathname);
    }

    // セットアップページは認証不要
    if (pathname.startsWith("/admin/setup/")) {
      return createResponse(req, pathname);
    }

    // その他の管理画面: セッション必須
    const sessionCookie = getSessionCookie(req, {
      cookiePrefix: "admin-auth",
    });
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  return createResponse(req, pathname);
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
