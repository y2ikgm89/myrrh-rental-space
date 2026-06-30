/**
 * Cloudflare cache purge retry ユニットテスト
 *
 * `callPurgeApi` 内蔵の retry ロジック（429 / 5xx / Retry-After ヘッダー尊重）を検証する。
 *
 * setTimeout は spyOn で即時実行に置き換えて backoff sleep をスキップする。
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";

const originalSetTimeout = globalThis.setTimeout;

// =============================================================================
// Mock dependencies (cloudflare.ts が import するモジュール)
// =============================================================================

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

mock.module("@/shared/lib/errors/logger-core", () => ({
  logger: {
    info: mock(),
    warn: mock(),
    debug: mock(),
    error: mock(),
  },
}));

mock.module("@/shared/lib/constants", () => ({
  getBaseUrl: () => "http://localhost:3000",
}));

// env-only credentials: `cloudflare.ts` は `serverEnv` から CLOUDFLARE_ZONE_ID /
// CLOUDFLARE_API_TOKEN を読む。test では `serverEnv` モジュール自体を mock して
// credentials の有無を切り替える（process.env 直接書き換えは @t3-oss/env-nextjs の
// validate キャッシュを bypass できないため不可）。
//
// 注: import 側は `serverEnv` 識別子を 1 度しか解決しないため、テスト中の差し替えは
// **同じオブジェクト参照を保ったままプロパティを mutate** する（reassign 不可）。
const mockServerEnv: {
  CLOUDFLARE_ZONE_ID: string | undefined;
  CLOUDFLARE_API_TOKEN: string | undefined;
} = {
  CLOUDFLARE_ZONE_ID: "a".repeat(32),
  CLOUDFLARE_API_TOKEN: "test-token",
};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
  isProduction: () => false,
}));

const { purgeCloudflareCache } = await import("@/shared/lib/cloudflare");

// =============================================================================
// Helpers
// =============================================================================

function jsonResponse(
  data: unknown,
  init?: ResponseInit & { retryAfter?: string },
): Response {
  const headers = new Headers({ "content-type": "application/json" });
  if (init?.retryAfter) {
    headers.set("retry-after", init.retryAfter);
  }
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers,
  });
}

/**
 * `typeof fetch` は `preconnect` メソッドを持つため、`async () => Response` だけでは
 * 型不一致になる。test の mock 実装にも同じ static property を持たせる。
 */
function createFetchImpl(
  impl: () => Promise<Response>,
): typeof globalThis.fetch {
  return Object.assign(
    (_input: Parameters<typeof globalThis.fetch>[0]) => impl(),
    {
      preconnect: globalThis.fetch.preconnect,
    },
  );
}

function runImmediateSetTimeout<TArgs extends unknown[]>(
  handler: (...args: TArgs) => void,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: TArgs
): ReturnType<typeof originalSetTimeout>;
function runImmediateSetTimeout(
  handler: TimerHandler,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: unknown[]
): number;
function runImmediateSetTimeout(
  handler: TimerHandler,
  _timeout?: Parameters<typeof originalSetTimeout>[1],
  ...args: unknown[]
): number | ReturnType<typeof originalSetTimeout> {
  if (typeof handler === "function") {
    Reflect.apply(handler, undefined, args);
  }
  return originalSetTimeout(() => {}, 0);
}

const immediateSetTimeout = Object.assign(runImmediateSetTimeout, {
  __promisify__: originalSetTimeout.__promisify__,
});

// =============================================================================
// Tests
// =============================================================================

describe("purgeCloudflareCache - retry", () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;
  let setTimeoutSpy: ReturnType<typeof spyOn<typeof globalThis, "setTimeout">>;

  beforeEach(() => {
    // 同一参照を維持したままプロパティを mutate（reassign は import side に反映されない）
    mockServerEnv.CLOUDFLARE_ZONE_ID = "a".repeat(32);
    mockServerEnv.CLOUDFLARE_API_TOKEN = "test-token";

    // backoff の sleep を即時実行（test 高速化）
    setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(
      immediateSetTimeout,
    );

    fetchSpy = spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  test("成功時は success: true を返す（retry なし）", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ success: true }));
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result).toEqual({ success: true, purgedFiles: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("429 (rate limit) で retry されて最終的に成功", async () => {
    let calls = 0;
    fetchSpy.mockImplementation(
      createFetchImpl(async () => {
        calls++;
        if (calls < 2) return jsonResponse({}, { status: 429 });
        return jsonResponse({ success: true });
      }),
    );
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result).toEqual({ success: true, purgedFiles: 1 });
    expect(calls).toBe(2);
  });

  test("503 (service unavailable) で retry されて最終的に成功", async () => {
    let calls = 0;
    fetchSpy.mockImplementation(
      createFetchImpl(async () => {
        calls++;
        if (calls < 3) return jsonResponse({}, { status: 503 });
        return jsonResponse({ success: true });
      }),
    );
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result).toEqual({ success: true, purgedFiles: 1 });
    expect(calls).toBe(3);
  });

  test("401 (auth error) は即時失敗（retry なし）", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 401 }));
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("API認証エラー");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("403 (forbidden) は即時失敗（retry なし）", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 403 }));
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("API認証エラー");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("4 回連続 429 で諦めて失敗を返す（max 3 retries = 4 calls 合計）", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 429 }));
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("レート制限");
    // 初回 + 3 retries = 4 calls
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  test("Retry-After ヘッダーがあると setTimeout に retry-after の値が渡される", async () => {
    let calls = 0;
    fetchSpy.mockImplementation(
      createFetchImpl(async () => {
        calls++;
        if (calls < 2) {
          // Retry-After: 2 seconds
          return jsonResponse({}, { status: 429, retryAfter: "2" });
        }
        return jsonResponse({ success: true });
      }),
    );
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result).toEqual({ success: true, purgedFiles: 1 });
    expect(calls).toBe(2);
    // 1 回目の失敗後に setTimeout が呼ばれている
    expect(setTimeoutSpy).toHaveBeenCalled();
    const firstSleepArgs = setTimeoutSpy.mock.calls[0];
    expect(firstSleepArgs).toBeDefined();
    // Retry-After: 2 秒 → 2000ms（exponential backoff の 1000ms より優先）
    if (firstSleepArgs && typeof firstSleepArgs[1] === "number") {
      expect(firstSleepArgs[1]).toBe(2000);
    }
  });

  test("不正な Retry-After ヘッダーは無視して exponential backoff にフォールバック", async () => {
    let calls = 0;
    fetchSpy.mockImplementation(
      createFetchImpl(async () => {
        calls++;
        if (calls < 2) {
          // 不正な Retry-After（数値以外）
          return jsonResponse({}, { status: 429, retryAfter: "invalid" });
        }
        return jsonResponse({ success: true });
      }),
    );
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result.success).toBe(true);
    expect(calls).toBe(2);
  });

  test("400 (bad request) は retry せず即時失敗", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}, { status: 400 }));
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("HTTPエラー");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test("Cloudflare API レスポンスが success: false なら error メッセージを返す", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        success: false,
        errors: [{ code: 1006, message: "URL is not valid" }],
      }),
    );
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result.success).toBe(false);
    expect(result.error).toBe("URL is not valid");
  });

  test("credentials 未設定時は success: true で no-op", async () => {
    mockServerEnv.CLOUDFLARE_ZONE_ID = undefined;
    mockServerEnv.CLOUDFLARE_API_TOKEN = undefined;
    const result = await purgeCloudflareCache(["https://example.com/page"]);
    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("空 URL 配列は success: true で no-op", async () => {
    const result = await purgeCloudflareCache([]);
    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
