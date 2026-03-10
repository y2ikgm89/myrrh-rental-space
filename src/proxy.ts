/**
 * Next.js 16 Proxy
 *
 * 認証前の admin gate と共通セキュリティヘッダーだけを担当する。
 * 公開ルーティングの解決は route 側で行う。
 */

import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_GATE_COOKIE_NAME } from "@/shared/lib/admin-login-gate-cookie";
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
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://placehold.co https://images.unsplash.com;
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

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = req.nextUrl;

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
    const sessionCookie = getSessionCookie(req);

    if (pathname === "/admin/login") {
      const adminGateCookie = req.cookies.get(ADMIN_GATE_COOKIE_NAME);
      if (
        adminGateCookie?.value === "1" ||
        !!sessionCookie ||
        searchParams.has("token")
      ) {
        return createResponse(req, pathname);
      }

      return new NextResponse(null, { status: 404 });
    }

    if (pathname.startsWith("/admin/setup/")) {
      return createResponse(req, pathname);
    }

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
