/**
 * Google Business Profile retry wrapper ユニットテスト
 *
 * 公式推奨「403 usageLimits は 429 と機能的に同等で exponential backoff 再試行」
 * が正しく実装されていることを検証する。
 */

import { describe, test, expect } from "bun:test";
import {
  isRetryableGbpApiError,
  withGbpApiRetry,
} from "@/shared/lib/google-business-profile/retry";

describe("isRetryableGbpApiError", () => {
  describe("HTTP status ベースの retry 判定", () => {
    test("429 は retry 対象", () => {
      expect(isRetryableGbpApiError({ code: 429 })).toBe(true);
      expect(isRetryableGbpApiError({ status: 429 })).toBe(true);
      expect(isRetryableGbpApiError({ response: { status: 429 } })).toBe(true);
    });

    test("500 は retry 対象", () => {
      expect(isRetryableGbpApiError({ code: 500 })).toBe(true);
    });

    test("503 は retry 対象", () => {
      expect(isRetryableGbpApiError({ code: 503 })).toBe(true);
    });

    test("400 / 401 / 404 / 410 は即時失敗", () => {
      expect(isRetryableGbpApiError({ code: 400 })).toBe(false);
      expect(isRetryableGbpApiError({ code: 401 })).toBe(false);
      expect(isRetryableGbpApiError({ code: 404 })).toBe(false);
      expect(isRetryableGbpApiError({ code: 410 })).toBe(false);
    });
  });

  describe("403 + reason ベースの retry 判定（公式推奨）", () => {
    test("403 + rateLimitExceeded は retry 対象", () => {
      const error = {
        code: 403,
        errors: [{ domain: "usageLimits", reason: "rateLimitExceeded" }],
      };
      expect(isRetryableGbpApiError(error)).toBe(true);
    });

    test("403 + userRateLimitExceeded は retry 対象", () => {
      const error = {
        code: 403,
        errors: [{ domain: "usageLimits", reason: "userRateLimitExceeded" }],
      };
      expect(isRetryableGbpApiError(error)).toBe(true);
    });

    test("403 + quotaExceeded は retry 対象", () => {
      const error = {
        code: 403,
        errors: [{ domain: "usageLimits", reason: "quotaExceeded" }],
      };
      expect(isRetryableGbpApiError(error)).toBe(true);
    });

    test("GaxiosError 形式（response.data.error.errors 配列）でも抽出できる", () => {
      const error = {
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              errors: [{ domain: "usageLimits", reason: "rateLimitExceeded" }],
            },
          },
        },
      };
      expect(isRetryableGbpApiError(error)).toBe(true);
    });

    test("403 + forbidden（認可エラー）は retry 対象外", () => {
      const error = {
        code: 403,
        errors: [{ domain: "global", reason: "forbidden" }],
      };
      expect(isRetryableGbpApiError(error)).toBe(false);
    });

    test("403 + 不明な reason は retry 対象外", () => {
      const error = {
        code: 403,
        errors: [{ domain: "global", reason: "someUnknownReason" }],
      };
      expect(isRetryableGbpApiError(error)).toBe(false);
    });

    test("403 で reason が欠落している場合は retry 対象外", () => {
      const error = { code: 403 };
      expect(isRetryableGbpApiError(error)).toBe(false);
    });
  });

  describe("ネットワーク層エラー", () => {
    test("ECONNRESET / ETIMEDOUT / EAI_AGAIN / ENOTFOUND / ECONNREFUSED は retry 対象", () => {
      expect(isRetryableGbpApiError({ code: "ECONNRESET" })).toBe(true);
      expect(isRetryableGbpApiError({ code: "ETIMEDOUT" })).toBe(true);
      expect(isRetryableGbpApiError({ code: "EAI_AGAIN" })).toBe(true);
      expect(isRetryableGbpApiError({ code: "ENOTFOUND" })).toBe(true);
      expect(isRetryableGbpApiError({ code: "ECONNREFUSED" })).toBe(true);
    });

    test("不明な system code は retry 対象外", () => {
      expect(isRetryableGbpApiError({ code: "EACCES" })).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("null / undefined は retry 対象外", () => {
      expect(isRetryableGbpApiError(null)).toBe(false);
      expect(isRetryableGbpApiError(undefined)).toBe(false);
    });

    test("primitive は retry 対象外", () => {
      expect(isRetryableGbpApiError("error")).toBe(false);
      expect(isRetryableGbpApiError(123)).toBe(false);
    });
  });
});

describe("withGbpApiRetry", () => {
  test("成功時は即座に結果を返す", async () => {
    let calls = 0;
    const result = await withGbpApiRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retry 対象でないエラーは即座にスロー（retry なし）", async () => {
    let calls = 0;
    await expect(
      withGbpApiRetry(async () => {
        calls++;
        throw { code: 404, message: "Not Found" };
      }),
    ).rejects.toMatchObject({ code: 404 });
    expect(calls).toBe(1);
  });

  test("403 rateLimitExceeded は retry される", async () => {
    let calls = 0;
    const result = await withGbpApiRetry(
      async () => {
        calls++;
        if (calls < 2) {
          throw {
            code: 403,
            errors: [{ domain: "usageLimits", reason: "rateLimitExceeded" }],
          };
        }
        return "ok";
      },
      { maxRetries: 2 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  test("maxRetries を超えたら最後のエラーをスロー", async () => {
    let calls = 0;
    await expect(
      withGbpApiRetry(
        async () => {
          calls++;
          throw { code: 503, message: "Service Unavailable" };
        },
        { maxRetries: 1 },
      ),
    ).rejects.toMatchObject({ code: 503 });
    // 初回 + 1 retry = 2 calls
    expect(calls).toBe(2);
  });

  test("shouldRetry option で追加の retry 条件を注入できる", async () => {
    let calls = 0;
    const result = await withGbpApiRetry(
      async () => {
        calls++;
        if (calls < 2) throw { code: 418 };
        return "ok";
      },
      {
        maxRetries: 2,
        shouldRetry: (error) =>
          typeof error === "object" &&
          error !== null &&
          (error as { code?: number }).code === 418,
      },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
