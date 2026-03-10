/**
 * APIレート制限
 *
 * LRU Cacheを使用したシンプルなレート制限
 * IPアドレスベースでリクエスト数を制限
 */

import { LRUCache } from "lru-cache";

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

interface RateLimiterOptions {
  /** 制限リセットまでの間隔 (ミリ秒) */
  interval: number;
  /** 間隔内の最大リクエスト数 */
  maxRequests: number;
  /** キャッシュの最大エントリ数 */
  maxTokens?: number;
}

/**
 * レート制限インスタンスを作成
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { interval, maxRequests, maxTokens = 10000 } = options;

  const cache = new LRUCache<string, { count: number; resetTime: number }>({
    max: maxTokens,
    ttl: interval,
  });

  return {
    /**
     * レート制限をチェック
     * @param token 識別子（通常はIPアドレス）
     * @returns レート制限の結果
     */
    check(token: string): RateLimitResult {
      const now = Date.now();
      const entry = cache.get(token);

      if (!entry || entry.resetTime <= now) {
        // 新規エントリまたはリセット時刻を過ぎた場合
        const resetTime = now + interval;
        cache.set(token, { count: 1, resetTime });
        return {
          success: true,
          remaining: maxRequests - 1,
          reset: resetTime,
        };
      }

      if (entry.count >= maxRequests) {
        // 制限超過
        return {
          success: false,
          remaining: 0,
          reset: entry.resetTime,
        };
      }

      // カウントを増加
      entry.count += 1;
      cache.set(token, entry);

      return {
        success: true,
        remaining: maxRequests - entry.count,
        reset: entry.resetTime,
      };
    },

    /**
     * 特定のトークンのレート制限をリセット
     */
    reset(token: string): void {
      cache.delete(token);
    },
  };
}

/**
 * リクエストからIPアドレスを取得
 */
export function getClientIp(request: Request): string {
  // Cloudflare
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  // X-Forwarded-For（プロキシ経由）
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map((ip) => ip.trim());
    return ips[0] ?? "unknown";
  }

  // X-Real-IP
  const xRealIp = request.headers.get("x-real-ip");
  if (xRealIp) return xRealIp;

  return "unknown";
}

// デフォルトのAPI用レート制限（100リクエスト/分/IP）
export const apiRateLimiter = createRateLimiter({
  interval: 60 * 1000, // 1分
  maxRequests: 100,
});
