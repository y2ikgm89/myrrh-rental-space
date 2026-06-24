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
import { parseCloudTraceContext } from "@/shared/lib/errors/logger-core";
import { checkRateLimit, getClientIp } from "@/shared/lib/rate-limit";
import { timingSafeEqualStrings } from "@/shared/lib/timing-safe";

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
  // Lighthouse Best Practices `coop` audit 通過。cross-origin の opener / popup から
  // window.opener 経由でアクセスされないよう top-level browsing context を分離する
  // (Spectre / cross-origin 情報漏洩の defense-in-depth)。
  // 値選定: better-auth の social login は redirect flow (`/api/auth/sign-in/social/*`)
  // を使い popup + postMessage は使わない。Stripe / Cloudflare Turnstile / Google reCAPTCHA
  // / YouTube / Instagram embed は全て iframe 経由で COOP の影響を受けない。
  // `_blank` で開く external tab (`openExternalTab`) は noreferrer で opener が
  // 既に severed なため COOP 無関係。よって `same-origin-allow-popups` に緩める
  // 必要はなく、最も厳格な `same-origin` を採用。
  // 参考: https://developer.mozilla.org/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy
  ["Cross-Origin-Opener-Policy", "same-origin"],
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

/**
 * localhost / 127.0.0.1 への HTTP 接続では HSTS / upgrade-insecure-requests を
 * skip する。これらは HTTPS 前提の directive で、HTTP-only な localhost に対して
 * 適用すると Chrome が HTTPS への redirect を強制し certificate warning page
 * (CHROME_INTERSTITIAL_ERROR) で navigation が fail する（Lighthouse / E2E が
 * 必ず broken になる silent bug）。
 */
function isLocalhostRequest(req: NextRequest): boolean {
  const host = req.headers.get("host") ?? "";
  return (
    host.startsWith("localhost:") ||
    host === "localhost" ||
    host.startsWith("127.0.0.1:") ||
    host === "127.0.0.1"
  );
}

function buildCsp(
  nonce: string,
  pathname: string,
  isLocalhost: boolean,
): string {
  const isDev = serverEnv.NODE_ENV === "development";
  const mediaSource = getConfiguredMediaSource();
  // CSP ディレクティブの方針:
  // - script-src: nonce + strict-dynamic を厳格維持。Next.js が自前 script と
  //   @next/third-parties / Clarity のローダーに nonce を付与し、strict-dynamic が
  //   そこから派生する script を許可する（host allowlist 不要）。
  // - style-src: 'unsafe-inline' を許可。nonce は <style> 要素のみ認可し、インライン
  //   style 属性（next/image fill・React の style prop・アニメーション初期値など）は
  //   CSP3 仕様上 nonce で認可できず、本番では全て遮断される（実ブラウザでホームページに
  //   39 件の "inline style ... has been blocked" を確認）。style インジェクションは
  //   script より低リスクのため、Next.js 公式の非 nonce 例に倣い 'unsafe-inline' を許可する。
  // - connect-src / img-src: strict-dynamic は script-src のみ作用するため、ビーコン送信先は
  //   明示許可が必要。GA4 は *.google-analytics.com（地域別 region1/2/3 を包含）/
  //   *.analytics.google.com に加え、gtag.js / GTM が設定取得・収集に使う *.googletagmanager.com
  //   も connect-src / img-src に必要（Google 公式 Tag Platform CSP ガイド準拠）。
  //   Microsoft Clarity は *.clarity.ms / c.bing.com へデータをアップロードする。
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:${mediaSource ? ` ${mediaSource}` : ""} https://*.r2.dev https://img.youtube.com https://*.cdninstagram.com https://*.fbcdn.net https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms;
    font-src 'self';
    connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com${isDev ? " ws://localhost:*" : ""};
    frame-src 'self' https://challenges.cloudflare.com https://js.stripe.com https://www.youtube.com https://player.vimeo.com https://open.spotify.com https://www.figma.com https://www.instagram.com https://www.google.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors ${resolveFrameAncestors(pathname)};
    ${isLocalhost ? "" : "upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applySecurityHeaders(
  headers: Headers,
  csp: string,
  isLocalhost: boolean,
): void {
  for (const [key, value] of SECURITY_HEADERS) {
    // HSTS は HTTPS 前提の directive。localhost (HTTP-only) に対して付与すると
    // Chrome が HTTPS upgrade を強制し interstitial error が発生する。
    if (key === "Strict-Transport-Security" && isLocalhost) continue;
    headers.set(key, value);
  }
  headers.set("Content-Security-Policy", csp);
}

/**
 * Cloud Run / Load Balancer が発行する `X-Cloud-Trace-Context` を解析し、
 * 後段（Server Component / Route Handler / Server Action / instrumentation）から
 * `headers()` で取得しやすい flat header (`x-trace-id` / `x-span-id` / `x-trace-sampled`)
 * として転写する。
 *
 * これにより Cloud Logging 構造化ログの `logging.googleapis.com/trace`・`spanId` 特殊
 * フィールドを起点とした 1 request 横断検索が成立する。
 *
 * @see https://cloud.google.com/trace/docs/setup#force-trace
 * @see https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
 */
function applyTraceHeaders(req: NextRequest, headers: Headers): void {
  const traceHeader = req.headers.get("x-cloud-trace-context");
  const parsed = parseCloudTraceContext(traceHeader);
  if (!parsed) return;
  headers.set("x-trace-id", parsed.traceId);
  if (parsed.spanId) headers.set("x-span-id", parsed.spanId);
  if (typeof parsed.traceSampled === "boolean") {
    headers.set("x-trace-sampled", parsed.traceSampled ? "1" : "0");
  }
}

function createResponse(req: NextRequest, pathname: string): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isLocalhost = isLocalhostRequest(req);
  const cspValue = buildCsp(nonce, pathname, isLocalhost);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("Content-Security-Policy", cspValue);
  applyTraceHeaders(req, requestHeaders);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-pathname", pathname);
  applySecurityHeaders(response.headers, cspValue, isLocalhost);
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
  // 開発環境では Admin Gate をバイパス（generate-login-url.ts 不要にする）。
  // `=== "development"` 厳密判定で staging / production を確実に除外。
  if (serverEnv.NODE_ENV === "development") {
    return createResponse(req, pathname);
  }

  const gateCookie = req.cookies.get(ADMIN_GATE_COOKIE_NAME);

  // gate cookie がある → 通過（timing-safe comparison for defensive consistency）
  if (gateCookie?.value && timingSafeEqualStrings(gateCookie.value, "1")) {
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

/**
 * ゲストキャンセル URL `?token=…` を HttpOnly cookie に転写して `?token` を URL から除去する。
 *
 * URL クエリに含まれるトークンは Cloud Run / Cloudflare のアクセスログ、ブラウザ履歴、
 * autocomplete、同一オリジン Link クリック時の Referer 等あらゆる地点に残留する。
 * cookie に転写することで残留経路を遮断し、cookie 自体は HttpOnly + SameSite=Strict +
 * (本番) Secure で送信制御する。
 *
 * トークン形式は middleware (edge) で軽量検証のみ行う:
 *   - base64url 文字種
 *   - 長さ 32〜1024 字（典型 100〜300）
 * 暗号学的な verify は Node ランタイムの page/action で実施する。
 */
const CANCEL_TOKEN_COOKIE_NAME = "cancel-token";
const CANCEL_TOKEN_COOKIE_MAX_AGE = 30 * 60; // 30 分
const CANCEL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,1024}$/;

function handleGuestCancelTokenTransfer(req: NextRequest): NextResponse | null {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname !== "/reservation/cancel") return null;
  const token = searchParams.get("token");
  if (!token) return null;

  // 不正形式の token は cookie に書かず ?token も外して redirect（ページが invalid と判定）
  const cleanUrl = new URL(req.url);
  cleanUrl.searchParams.delete("token");
  const response = NextResponse.redirect(cleanUrl);

  if (CANCEL_TOKEN_PATTERN.test(token)) {
    response.cookies.set({
      name: CANCEL_TOKEN_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "strict",
      secure: !isLocalhostRequest(req),
      path: "/",
      maxAge: CANCEL_TOKEN_COOKIE_MAX_AGE,
    });
  }
  return response;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  const cancelTransfer = handleGuestCancelTokenTransfer(req);
  if (cancelTransfer) return cancelTransfer;

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
      const rateLimitResult = await checkRateLimit(pathname, clientIp);

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

      // fail-closed: CRON_SECRET 未設定時は全環境で 401
      // 本番は validateProductionEnv が起動時に throw、dev/staging はここで拒否
      // (Vercel Cron / Cloud Scheduler / GitHub Actions の業界標準)
      if (!cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const authHeader = req.headers.get("authorization");
      const expected = `Bearer ${cronSecret}`;
      if (!authHeader || !timingSafeEqualStrings(authHeader, expected)) {
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

    if (pathname === "/admin/login/consume") {
      return createResponse(req, pathname);
    }

    // セットアップページは認証不要
    if (pathname.startsWith("/admin/setup/")) {
      return createResponse(req, pathname);
    }

    // パスワードリセット系ページは認証不要（ログインできないユーザーがアクセスする）
    // Turnstile + Better Auth の TURNSTILE_PROTECTED_ENDPOINTS で別途レート制限・bot 対策済み
    if (
      pathname === "/admin/forgot-password" ||
      pathname === "/admin/reset-password"
    ) {
      return createResponse(req, pathname);
    }

    // その他の管理画面: セッション必須
    const sessionCookie = getSessionCookie(req, {
      cookiePrefix: "admin-auth",
    });
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }

    // 管理画面内部 API（/admin/api/*）: 認証済みでも IP 単位で rate-limit を貼る
    // (defense-in-depth)。低権限スタッフによる内部 DoS や OGP 外向き fetch
    // amplifier を構造的に抑制する。重い endpoint（OGP / customer-search）は
    // expensiveAdminRateLimiter (60/分)、その他は apiRateLimiter (100/分)。
    // 振分は checkRateLimit() が SSoT。
    if (pathname.startsWith("/admin/api/")) {
      const clientIp = getClientIp(req);
      const rateLimitResult = await checkRateLimit(pathname, clientIp);

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
