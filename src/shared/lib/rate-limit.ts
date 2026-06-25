/**
 * API レート制限（Strategy/Adapter Pattern）
 *
 * `RateLimitStore` interface で backend を抽象化し、in-memory（LRUCache）実装を
 * 提供する SSoT。
 *
 * **設計判断（Cloud Run max=1 構成依存）:**
 * 本実装は **Cloud Run max instance = 1 の単一インスタンス前提**で per-instance
 * protection のみ提供する。max=1 構成では「全リクエストが同一プロセスを通る」
 * ため、`InMemoryRateLimitStore`（LRU bucket）でグローバル rate limit として
 * 十分に機能する。
 *
 * **autoscale 解禁時の制約（未実装）:**
 * 将来 multi-instance autoscale（max>1）に移行する場合、各 instance が独立した
 * bucket を持ち「同一 IP が N instance × maxRequests/min を発行可能」になる
 * ため、distributed backend（Upstash Redis / Cloud Memorystore 等）の実装が
 * **必須**になる。本ファイルには Redis backend 実装は存在しない — autoscale
 * 解禁時は新規追加が必要。
 *
 * **多層防御:**
 * - Layer 1: `InMemoryRateLimitStore`（このファイル、Cloud Run max=1 でグローバル）
 * - Layer 2: Cloudflare Turnstile（公開フォームの bot 緩和、`turnstile-actions.ts`）
 * - Layer 3: Cloud Run autoscale max instance 数（実質的なグローバル上限）
 * - Layer 4: Cloudflare WAF Custom Rules（CDN 層 IP rate limit、運用配線）
 *
 * **interface contract:**
 * `check(token, options)` は `Promise<RateLimitResult>` を返す（将来の
 * distributed backend 追加を見越した async）。in-memory 実装は LRU から
 * 同期取得するが、`Promise.resolve()` で wrap して interface を統一する。
 */

import { LRUCache } from "lru-cache";

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

export interface RateLimiterOptions {
  /** 制限リセットまでの間隔 (ミリ秒) */
  interval: number;
  /** 間隔内の最大リクエスト数 */
  maxRequests: number;
  /** キャッシュの最大エントリ数（in-memory backend 専用） */
  maxTokens?: number;
}

export interface RateLimitStore {
  /**
   * Token のカウンタを 1 増やし、現在の状態を返す。
   * 並列呼び出しに対して safe であること（Redis backend は INCR + EXPIRE が atomic）。
   */
  check(token: string, options: RateLimiterOptions): Promise<RateLimitResult>;
  /** Token をリセット（テスト/管理操作用） */
  reset(token: string): Promise<void>;
}

/**
 * Per-instance の in-memory rate limit store（LRUCache backend）。
 *
 * Cloud Run multi-instance 環境では各 instance ごとに独立した bucket になるため、
 * 完全な distributed protection ではなく **soft floor** として機能する。
 * 完全な分散制限が必要な場合は `RedisRateLimitStore` に切り替える（env-driven）。
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly cache: LRUCache<
    string,
    { count: number; resetTime: number }
  >;
  private readonly interval: number;

  constructor(options: RateLimiterOptions) {
    const { interval, maxTokens = 10000 } = options;
    this.interval = interval;
    this.cache = new LRUCache({ max: maxTokens, ttl: interval });
  }

  check(token: string, options: RateLimiterOptions): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.cache.get(token);

    if (!entry || entry.resetTime <= now) {
      const resetTime = now + this.interval;
      this.cache.set(token, { count: 1, resetTime });
      return Promise.resolve({
        success: true,
        remaining: options.maxRequests - 1,
        reset: resetTime,
      });
    }

    if (entry.count >= options.maxRequests) {
      return Promise.resolve({
        success: false,
        remaining: 0,
        reset: entry.resetTime,
      });
    }

    entry.count += 1;
    this.cache.set(token, entry);
    return Promise.resolve({
      success: true,
      remaining: options.maxRequests - entry.count,
      reset: entry.resetTime,
    });
  }

  reset(token: string): Promise<void> {
    this.cache.delete(token);
    return Promise.resolve();
  }
}

/**
 * レート制限インスタンスを作成（Adapter pattern）。
 *
 * デフォルトは `InMemoryRateLimitStore`。将来 Redis 等に切り替える場合は
 * store を差し替える（`createRateLimiter({ ... }, new RedisRateLimitStore(...))`）。
 *
 * @returns `{ check(token): Promise<RateLimitResult>; reset(token): Promise<void> }`
 */
export function createRateLimiter(
  options: RateLimiterOptions,
  store: RateLimitStore = new InMemoryRateLimitStore(options),
) {
  return {
    check: (token: string) => store.check(token, options),
    reset: (token: string) => store.reset(token),
  };
}

/**
 * ヘッダからクライアント IP を抽出する共通ロジック（getClientIp / getClientIpFromHeaders で共有）。
 *
 * ⚠ セキュリティ前提（重要・infra 依存）:
 * `cf-connecting-ip` / `x-forwarded-for` / `x-real-ip` はいずれも**クライアントが詐称可能**な
 * ヘッダ。本番の ingress が **Cloudflare 限定**（Cloud Run へ直接到達不可）であることを前提に、
 * その場合のみ Cloudflare が `cf-connecting-ip` を実クライアント IP で上書きするため詐称不可になる。
 * origin が Cloudflare をバイパスして直接到達可能だと、攻撃者がこれらのヘッダを回転させて
 * rate limiter のバケット（authMutation 20/15分・public-form 5/分等）や
 * Turnstile remoteip を回避できる。
 *
 * → infra 側で「ingress = Cloudflare 限定」を保証すること（Cloud Run の ingress 制限 +
 * Cloudflare egress IP 許可、または Authenticated Origin Pulls）。マルチ ingress を許す構成に
 * する場合は、Cloudflare Transform Rule で注入する共有シークレットヘッダを timing-safe 比較で
 * 検証してから `cf-connecting-ip` を信頼する方式へ移行する（現状その infra は未配備のため、
 * 検証コードを入れると全リクエストが platform 接続 IP=Cloudflare の IP に集約され rate limiter が
 * 実質グローバル化して壊れるため未実装）。`x-forwarded-for` / `x-real-ip` フォールバックは
 * Cloudflare 不在の環境（ローカル開発・直 proxy）向け。
 */
function extractClientIp(getHeader: (name: string) => string | null): string {
  // Cloudflare（ingress が Cloudflare 限定なら上書き済みで信頼可能）
  const cfConnectingIp = getHeader("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  // X-Forwarded-For（Cloudflare 不在のプロキシ環境向けフォールバック）
  const xForwardedFor = getHeader("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());
    return ips[0] ?? "unknown";
  }

  // X-Real-IP
  const xRealIp = getHeader("x-real-ip");
  if (xRealIp) return xRealIp;

  return "unknown";
}

/**
 * リクエストからIPアドレスを取得（信頼前提は extractClientIp の docstring 参照）
 */
export function getClientIp(request: Request): string {
  return extractClientIp((name) => request.headers.get(name));
}

// デフォルトのAPI用レート制限（100リクエスト/分/IP）
export const apiRateLimiter = createRateLimiter({
  interval: 60 * 1000, // 1分
  maxRequests: 100,
});

// 認証 mutation 用（sign-in/sign-up/sign-out 等）— ブルートフォース対策（20リクエスト/15分/IP）
export const authMutationRateLimiter = createRateLimiter({
  interval: 15 * 60 * 1000, // 15分
  maxRequests: 20,
});

// 公開フォーム送信用（5リクエスト/分/IP）— スパム対策
export const formSubmitRateLimiter = createRateLimiter({
  interval: 60 * 1000, // 1分
  maxRequests: 5,
});

// 公開クエリ用（30リクエスト/分/IP）— DoS対策
export const publicQueryRateLimiter = createRateLimiter({
  interval: 60 * 1000, // 1分
  maxRequests: 30,
});

// ゲストキャンセル「予約 ID 単位」の追加バケット（3 attempts / hour / reservation）。
// IP-only の formSubmitRateLimiter だけだと Cloud Run multi-instance × XFF spoof で
// 単一予約に対する分散攻撃が抜けるため、reservationId をキーにした第二防壁を貼る。
// AES-GCM トークン検証コスト × DB 書き込みコストの上限を構造的に制約する。
export const cancelByReservationRateLimiter = createRateLimiter({
  interval: 60 * 60 * 1000, // 1時間
  maxRequests: 3,
});

// 管理画面の「重い」内部 API 用（60 リクエスト/分/IP）— defense-in-depth。
// 認証済みスタッフでも、外向き fetch (OGP プレビュー) や全件 LIKE スキャン
// (customer 検索) のような副作用 / コスト大の endpoint は単独でレート制限する。
// 想定 abuse:
//   - 低権限スタッフによる内部 DoS（管理画面ループで意図せず大量発火する UI ミスも含む）
//   - OGP 外向き fetch を踏み台にした amplifier（origin 帯域消費・第三者サイトへの負荷）
// `apiRateLimiter`(100/分) より厳しく、`formSubmitRateLimiter`(5/分) より緩いバランス。
export const expensiveAdminRateLimiter = createRateLimiter({
  interval: 60 * 1000, // 1分
  maxRequests: 60,
});

/**
 * 管理画面の「重い」内部 API パス（expensiveAdminRateLimiter 適用対象）。
 * - `/admin/api/ogp` … 任意 URL の外向き fetch（amplifier 化リスク）
 * - `/admin/api/customers/search` … 全件 LIKE スキャン（DB CPU 大）
 */
const EXPENSIVE_ADMIN_API_PATHS: ReadonlyArray<string> = [
  "/admin/api/ogp",
  "/admin/api/customers/search",
];

function isExpensiveAdminApiPath(pathname: string): boolean {
  return EXPENSIVE_ADMIN_API_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Better Auth の「読み取り専用」エンドポイント。
 * get-session / list-sessions / list-accounts は credential を介さない参照系のため、
 * authMutationRateLimiter（20/15分）ではなく apiRateLimiter（100/分）で十分。
 *
 * Better Auth のエンドポイント命名は admin (`/api/auth/*`) / customer (`/api/customer-auth/*`)
 * いずれも共通（basePath だけが異なる）ため、basePath を剥がした最終セグメントで判定する。
 *
 * @see https://www.better-auth.com/docs/concepts/api
 */
const BETTER_AUTH_READONLY_ENDPOINTS: ReadonlySet<string> = new Set([
  "get-session",
  "list-sessions",
  "list-accounts",
]);

function isBetterAuthReadOnlyPath(pathname: string, basePath: string): boolean {
  const tail = pathname.slice(basePath.length).replace(/^\/+/, "");
  // 末尾の query/fragment は middleware の pathname には含まれないため、
  // 単純に先頭セグメントを比較すれば十分。
  const [segment] = tail.split("/");
  return segment ? BETTER_AUTH_READONLY_ENDPOINTS.has(segment) : false;
}

/**
 * パス名に基づいて適切なレートリミッターを選択しチェックする。
 *
 * Better Auth の mutation 系（sign-in / sign-up / sign-out / reset-password /
 * forget-password / change-password / change-email / verify-email /
 * update-user 等）は credential stuffing / enumeration 緩和のため
 * authMutationRateLimiter (20/15分) を使う。
 *
 * 顧客向け `/api/customer-auth/*`（公開サイトのソーシャル/パスワードログイン）と
 * 管理向け `/api/auth/*`（管理画面ログイン）は basePath のみ異なる同一の Better Auth
 * エンドポイント群なので、判定ロジックは対称に組む。
 */
export async function checkRateLimit(
  pathname: string,
  clientIp: string,
): Promise<RateLimitResult> {
  if (pathname.startsWith("/api/auth")) {
    if (isBetterAuthReadOnlyPath(pathname, "/api/auth")) {
      return apiRateLimiter.check(clientIp);
    }
    return authMutationRateLimiter.check(clientIp);
  }
  if (pathname.startsWith("/api/customer-auth")) {
    if (isBetterAuthReadOnlyPath(pathname, "/api/customer-auth")) {
      return apiRateLimiter.check(clientIp);
    }
    return authMutationRateLimiter.check(clientIp);
  }
  // 管理画面内部 API: 認証済みでも defense-in-depth で IP bucket をかける。
  // 重い endpoint は厳しめ (60/分)、その他は緩めの apiRateLimiter (100/分)。
  if (pathname.startsWith("/admin/api/")) {
    if (isExpensiveAdminApiPath(pathname)) {
      return expensiveAdminRateLimiter.check(clientIp);
    }
    return apiRateLimiter.check(clientIp);
  }
  return apiRateLimiter.check(clientIp);
}

/**
 * Server Action 用のIP取得（headers() 経由）
 */
export async function getClientIpFromHeaders(): Promise<string> {
  const { headers } = await import("next/headers");
  const hdrs = await headers();
  return extractClientIp((name) => hdrs.get(name));
}
