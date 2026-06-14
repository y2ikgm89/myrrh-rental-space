/**
 * API レート制限（Strategy/Adapter Pattern）
 *
 * `RateLimitStore` interface で backend を抽象化し、in-memory（LRUCache）と
 * Redis 等の distributed backend を switch 可能にした SSoT。
 *
 * **設計判断（distributed environments）:**
 * `InMemoryRateLimitStore` は **per-instance protection only**。Cloud Run の
 * multi-instance autoscale 環境では、各 instance が独立した bucket を持つため
 * 「同一 IP が N instance × maxRequests/min を発行可能」になる。完全な
 * distributed rate limiting には `RedisRateLimitStore`（Upstash Redis / Cloud
 * Memorystore 等）に env-driven で切り替える。
 *
 * **多層防御:**
 * - Layer 1: `InMemoryRateLimitStore`（このファイル、per-instance）
 * - Layer 2: Cloudflare Turnstile（公開フォームの bot 緩和、`turnstile-actions.ts`）
 * - Layer 3: Cloud Run autoscale max instance 数（実質的なグローバル上限）
 * - Layer 4: Cloudflare WAF Custom Rules（CDN 層 IP rate limit、運用配線）
 *
 * **interface contract:**
 * `check(token, options)` は `Promise<RateLimitResult>` を返す（Redis backend
 * 切替を前提とした async）。in-memory 実装は LRU から同期取得するが、
 * `Promise.resolve()` で wrap して interface を統一する。
 */

import { LRUCache } from "lru-cache";
import { serverEnv } from "@/shared/lib/env/server";
import { timingSafeEqual } from "@/shared/lib/timing-safe-equal";

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
 * Cloudflare をバイパスした直アクセスを集約する固定バケットキー。
 *
 * origin lock 有効時、`x-origin-verify` シークレットが一致しない（= Cloudflare
 * 経由を証明できない）リクエストは全てこのキーに合算される。これにより
 * IP ローテーションによる制限回避と、他ユーザー bucket の汚染（lockout）を
 * 同時に無効化する。
 */
const DIRECT_UNTRUSTED_BUCKET = "direct-untrusted";

/** Cloudflare Transform Rule が注入する origin 検証ヘッダー名 */
const ORIGIN_VERIFY_HEADER = "x-origin-verify";

/**
 * 提供された `x-origin-verify` 値が、許容シークレットのいずれかに一致するか
 * を定数時間で判定する。
 *
 * `secretSpec` はカンマ区切りで複数シークレットを許容する。これは**無停止
 * ローテーション**のオーバーラップ窓のため:
 *   1. env を `"<old>,<new>"` にして再デプロイ（両方を受理）
 *   2. Cloudflare Transform Rule の注入値を old→new へ切替
 *   3. env を `"<new>"` に縮退して再デプロイ
 * これによりローテーション中も正規トラフィックが {@link DIRECT_UNTRUSTED_BUCKET}
 * に落ちない。どの候補が一致したかのタイミング差を抑えるため早期 return しない。
 */
function matchesOriginSecret(provided: string, secretSpec: string): boolean {
  let matched = false;
  for (const candidate of secretSpec.split(",")) {
    const trimmed = candidate.trim();
    if (trimmed.length > 0 && timingSafeEqual(provided, trimmed)) {
      matched = true;
    }
  }
  return matched;
}

/**
 * ヘッダーアクセサからレート制限用のクライアント識別子（IP）を解決する純粋関数。
 *
 * **信頼境界（H3 対策）:**
 * Cloud Run の ingress が制限されていない場合、`*.run.app` へ直接到達でき
 * `cf-connecting-ip` / `x-forwarded-for` は偽装可能。`originSecret` が設定されて
 * いる場合のみ、Cloudflare が `x-origin-verify` に注入したシークレットが一致する
 * リクエスト（= Cloudflare 経由が証明されたもの）の `cf-connecting-ip` を信頼する。
 * 一致しない直アクセスは {@link DIRECT_UNTRUSTED_BUCKET} に集約する。
 *
 * `originSecret` が未設定（default）の場合は従来どおり
 * `cf-connecting-ip` → `x-forwarded-for[0]` → `x-real-ip` の順で best-effort 解決し、
 * 既存挙動を保つ（安全側のデフォルト = origin lock はオプトイン）。
 *
 * @param getHeader - ヘッダー名から値（無ければ null）を返すアクセサ
 * @param originSecret - `serverEnv.CLOUDFLARE_ORIGIN_SECRET`（未設定なら undefined）。
 *   ローテーション時はカンマ区切りで複数値を許容する。
 */
export function resolveClientIp(
  getHeader: (name: string) => string | null,
  originSecret: string | undefined,
): string {
  if (originSecret) {
    const provided = getHeader(ORIGIN_VERIFY_HEADER);
    const viaCloudflare =
      provided !== null && matchesOriginSecret(provided, originSecret);
    if (viaCloudflare) {
      const cfConnectingIp = getHeader("cf-connecting-ip");
      if (cfConnectingIp) return cfConnectingIp;
    }
    // Cloudflare をバイパスした直アクセス: 偽装ヘッダーを信頼しない
    return DIRECT_UNTRUSTED_BUCKET;
  }

  // origin lock 無効（default）: 従来の best-effort 解決
  const cfConnectingIp = getHeader("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  const xForwardedFor = getHeader("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const xRealIp = getHeader("x-real-ip");
  if (xRealIp) return xRealIp;

  return "unknown";
}

/**
 * リクエストからレート制限用のクライアント識別子を取得（proxy 用）
 */
export function getClientIp(request: Request): string {
  return resolveClientIp(
    (name) => request.headers.get(name),
    serverEnv.CLOUDFLARE_ORIGIN_SECRET,
  );
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

// ログイントークン用（30リクエスト/分/IP）
export const tokenRateLimiter = createRateLimiter({
  interval: 60 * 1000, // 1分
  maxRequests: 30,
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

/**
 * パス名に基づいて適切なレートリミッターを選択しチェックする
 */
export async function checkRateLimit(
  pathname: string,
  clientIp: string,
): Promise<RateLimitResult> {
  if (pathname.startsWith("/api/auth")) {
    // get-session は読み取り専用 — apiRateLimiter（100/分）で十分
    if (pathname === "/api/auth/get-session") {
      return apiRateLimiter.check(clientIp);
    }
    // sign-in/sign-up/sign-out 等の mutation — ブルートフォース対策
    return authMutationRateLimiter.check(clientIp);
  }
  if (pathname.startsWith("/api/admin/login-tokens")) {
    return tokenRateLimiter.check(clientIp);
  }
  return apiRateLimiter.check(clientIp);
}

/**
 * Server Action 用のIP取得（headers() 経由）。proxy 用 {@link getClientIp} と
 * 同じ信頼境界ロジック（{@link resolveClientIp}）を共有する。
 */
export async function getClientIpFromHeaders(): Promise<string> {
  const { headers } = await import("next/headers");
  const hdrs = await headers();
  return resolveClientIp(
    (name) => hdrs.get(name),
    serverEnv.CLOUDFLARE_ORIGIN_SECRET,
  );
}
