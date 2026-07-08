/**
 * Next.js 16 Proxy
 *
 * 共通セキュリティヘッダー・レート制限を担当する。
 * 公開ルーティングの解決は route 側で行う。
 */

import { NextResponse, type NextRequest } from "next/server";
import { FRAME_SRC_DIRECTIVE_VALUES } from "@/shared/lib/constants/frame-sources";
import {
  RESERVATION_CLAIM_TOKEN_COOKIE_NAME,
  EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME,
} from "@/shared/lib/constants/claim-token-cookie-names";
import { serverEnv } from "@/shared/lib/env/server";
import { parseCloudTraceContext } from "@/shared/lib/errors/logger-core";
import { checkRateLimit, getClientIp } from "@/shared/lib/rate-limit";

const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["X-DNS-Prefetch-Control", "on"],
  // Lighthouse Best Practices `coop` audit 通過。cross-origin の opener / popup から
  // window.opener 経由でアクセスされないよう top-level browsing context を分離する
  // (Spectre / cross-origin 情報漏洩の defense-in-depth)。
  // 値選定: better-auth の social login は redirect flow (`/api/customer-auth/sign-in/social/*`)
  // を使い popup + postMessage は使わない。Stripe / Cloudflare Turnstile / Google reCAPTCHA
  // / YouTube / Instagram embed は全て iframe 経由で COOP の影響を受けない。
  // `_blank` で開く external tab (`openExternalTab`) は noreferrer で opener が
  // 既に severed なため COOP 無関係。よって `same-origin-allow-popups` に緩める
  // 必要はなく、最も厳格な `same-origin` を採用。
  // 参考: https://developer.mozilla.org/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy
  ["Cross-Origin-Opener-Policy", "same-origin"],
];

const PUBLIC_SURFACE_BLOCKED_PATH_PREFIXES = [
  "/admin",
  "/preview",
  "/api/admin",
  "/api/instagram/oauth",
  "/api/google-business-profile/oauth",
] as const;

function isPathOrSubpath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isBlockedOnPublicSurface(pathname: string): boolean {
  if (serverEnv.APP_SURFACE !== "public") return false;
  return PUBLIC_SURFACE_BLOCKED_PATH_PREFIXES.some((prefix) =>
    isPathOrSubpath(pathname, prefix),
  );
}

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
  //   'wasm-unsafe-eval' は Turbopack 本番 runtime が `WebAssembly.instantiate` /
  //   `WebAssembly.compile` を使うため必須（Next.js 公式 CSP guide「Common CSP
  //   Violations」節で WebAssembly に対する canonical な directive として明記）。
  //   W3C CSP3 で 'wasm-unsafe-eval' は WASM のコンパイル/インスタンス化だけを
  //   許可する非対称な権限で、文字列 eval / new Function / setTimeout(string) は
  //   引き続き遮断される（'unsafe-eval' とは別物。'unsafe-eval' を本番に置かない
  //   設計 SSoT を侵害しない）。Chrome 97+ / Firefox 102+ / Safari 16+ で実装済。
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
  // - manifest-src: PWA manifest は公開 root metadata から same-origin route のみを
  //   明示リンクする。admin では link 自体を出さないが、CSP も same-origin に fail-closed。
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob:${mediaSource ? ` ${mediaSource}` : ""} https://img.youtube.com https://*.cdninstagram.com https://*.fbcdn.net https://*.google-analytics.com https://*.googletagmanager.com https://*.clarity.ms;
    font-src 'self';
    connect-src 'self' https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.clarity.ms https://c.bing.com${isDev ? " ws://localhost:*" : ""};
    manifest-src 'self';
    frame-src ${FRAME_SRC_DIRECTIVE_VALUES.join(" ")};
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

/**
 * 予約 / イベント参加申込の claim URL `?token=…` を HttpOnly cookie に転写し
 * `?token` を URL から除去する。理由・トークン形式検証方針はゲストキャンセル token
 * 転写（`handleGuestCancelTokenTransfer`）と同一。
 *
 * `sameSite` のみ意図的に異なる値（`"lax"`）を使う: この claim トークンは
 * Google/LINE への外部リダイレクト（OAuth）を経由して戻ってくる。SameSite=Strict の
 * cookie は「他サイトからの top-level navigation」では送信されないため、OAuth
 * コールバックで戻ってきた際に cookie が消えて claim が失敗する。SameSite=Lax は
 * top-level GET navigation では送信されるため、この往復を生き残る。ゲストキャンセルは
 * 外部サイトを経由しないため既存の `strict` のままで問題ない（変更しない）。
 */
const CLAIM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,1024}$/;
// OAuth 往復（Google/LINE への外部リダイレクトを経由して戻る）を生き越えるため 60 分。
// cancel-token（サイト外遷移が無い）より長めに取っている。
const CLAIM_TOKEN_COOKIE_MAX_AGE = 60 * 60; // 60 分

function handleClaimTokenTransfer(
  req: NextRequest,
  pathname: string,
  cookieName: string,
): NextResponse | null {
  const { searchParams } = req.nextUrl;
  if (req.nextUrl.pathname !== pathname) return null;
  const token = searchParams.get("token");
  if (!token) return null;

  const cleanUrl = new URL(req.url);
  cleanUrl.searchParams.delete("token");
  const response = NextResponse.redirect(cleanUrl);

  if (CLAIM_TOKEN_PATTERN.test(token)) {
    response.cookies.set({
      name: cookieName,
      value: token,
      httpOnly: true,
      // OAuth コールバックは他サイト(Google/LINE)からの top-level navigation で
      // 戻ってくるため、SameSite=Strict だと cookie が送信されず claim が失敗する。
      // Lax は top-level GET navigation では送信されるため往復を生き残る。
      sameSite: "lax",
      secure: !isLocalhostRequest(req),
      path: "/",
      maxAge: CLAIM_TOKEN_COOKIE_MAX_AGE,
    });
  }
  return response;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  const cancelTransfer = handleGuestCancelTokenTransfer(req);
  if (cancelTransfer) return cancelTransfer;

  const reservationClaimTransfer = handleClaimTokenTransfer(
    req,
    "/claim/reservation",
    RESERVATION_CLAIM_TOKEN_COOKIE_NAME,
  );
  if (reservationClaimTransfer) return reservationClaimTransfer;

  const eventRegistrationClaimTransfer = handleClaimTokenTransfer(
    req,
    "/claim/event-registration",
    EVENT_REGISTRATION_CLAIM_TOKEN_COOKIE_NAME,
  );
  if (eventRegistrationClaimTransfer) return eventRegistrationClaimTransfer;

  if (isBlockedOnPublicSurface(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  if (serverEnv.APP_SURFACE === "admin" && pathname === "/") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  if (pathname.startsWith("/api")) {
    // Cloud Run の liveness probe は x-forwarded-for を設定しないため、
    // getClientIp() が "unknown" を返し全 probe が同一 bucket に合算される。
    // burst 時に apiRateLimiter (100/min) を超過すると 429 → probe 失敗 → コンテナ kill の silent bug。
    // 外部依存に触れない `/api/live` のみ webhook / cron と同様に rate-limit 対象外。
    // `/api/health` は DB 疎通を含む監視・手動確認用 endpoint なので通常の API
    // rate-limit を適用する。
    const isProbeOrInfraEndpoint = pathname === "/api/live";

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

    return createResponse(req, pathname);
  }

  if (pathname.startsWith("/admin")) {
    // 管理入口は Cloud Run IAP が保護する。公開 service では
    // APP_SURFACE=public の blocklist により /admin/* 全体が 404 になる。
    // admin service 側ではアプリ内ログインフォームを持たず、IAP 通過後に
    // Server Component / Server Action 層で DB ロール照合を行う。
    if (pathname === "/admin/login") {
      return NextResponse.redirect(new URL("/admin", req.url));
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
