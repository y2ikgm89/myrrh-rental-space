/**
 * Google API 共通 retry wrapper ユニットテスト
 *
 * Google Calendar / Business Profile / Analytics 等の googleapis SDK
 * 全般で共有する `withGoogleApiRetry` の挙動を検証する。
 *
 * 公式推奨（https://developers.google.com/calendar/api/guides/errors）の
 * 「403 usageLimits は 429 と機能的に同等で exponential backoff 再試行」
 * が正しく実装されていることを検証する。
 */

import { describe, test, expect } from "bun:test";
import {
  isRetryableGoogleApiError,
  withGoogleApiRetry,
} from "@/shared/lib/google-api/retry";

describe("isRetryableGoogleApiError", () => {
  describe("HTTP status ベースの retry 判定", () => {
    test("429 は retry 対象", () => {
      expect(isRetryableGoogleApiError({ code: 429 })).toBe(true);
      expect(isRetryableGoogleApiError({ status: 429 })).toBe(true);
      expect(isRetryableGoogleApiError({ response: { status: 429 } })).toBe(
        true,
      );
    });

    test("500 は retry 対象", () => {
      expect(isRetryableGoogleApiError({ code: 500 })).toBe(true);
    });

    test("503 は retry 対象", () => {
      expect(isRetryableGoogleApiError({ code: 503 })).toBe(true);
    });

    test("400 / 401 / 404 / 410 は即時失敗", () => {
      expect(isRetryableGoogleApiError({ code: 400 })).toBe(false);
      expect(isRetryableGoogleApiError({ code: 401 })).toBe(false);
      expect(isRetryableGoogleApiError({ code: 404 })).toBe(false);
      expect(isRetryableGoogleApiError({ code: 410 })).toBe(false);
    });
  });

  describe("403 + reason ベースの retry 判定（公式推奨）", () => {
    test("403 + rateLimitExceeded は retry 対象", () => {
      const error = {
        code: 403,
        errors: [{ domain: "usageLimits", reason: "rateLimitExceeded" }],
      };
      expect(isRetryableGoogleApiError(error)).toBe(true);
    });

    test("403 + userRateLimitExceeded は retry 対象", () => {
      const error = {
        code: 403,
        errors: [{ domain: "usageLimits", reason: "userRateLimitExceeded" }],
      };
      expect(isRetryableGoogleApiError(error)).toBe(true);
    });

    test("403 + quotaExceeded は retry 対象", () => {
      const error = {
        code: 403,
        errors: [{ domain: "usageLimits", reason: "quotaExceeded" }],
      };
      expect(isRetryableGoogleApiError(error)).toBe(true);
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
      expect(isRetryableGoogleApiError(error)).toBe(true);
    });

    test("403 + forbidden（認可エラー）は retry 対象外", () => {
      const error = {
        code: 403,
        errors: [{ domain: "global", reason: "forbidden" }],
      };
      expect(isRetryableGoogleApiError(error)).toBe(false);
    });

    test("403 + 不明な reason は retry 対象外", () => {
      const error = {
        code: 403,
        errors: [{ domain: "global", reason: "someUnknownReason" }],
      };
      expect(isRetryableGoogleApiError(error)).toBe(false);
    });

    test("403 で reason が欠落している場合は retry 対象外", () => {
      const error = { code: 403 };
      expect(isRetryableGoogleApiError(error)).toBe(false);
    });
  });

  describe("ネットワーク層エラー", () => {
    test("ECONNRESET / ETIMEDOUT / EAI_AGAIN / ENOTFOUND / ECONNREFUSED は retry 対象", () => {
      expect(isRetryableGoogleApiError({ code: "ECONNRESET" })).toBe(true);
      expect(isRetryableGoogleApiError({ code: "ETIMEDOUT" })).toBe(true);
      expect(isRetryableGoogleApiError({ code: "EAI_AGAIN" })).toBe(true);
      expect(isRetryableGoogleApiError({ code: "ENOTFOUND" })).toBe(true);
      expect(isRetryableGoogleApiError({ code: "ECONNREFUSED" })).toBe(true);
    });

    test("不明な system code は retry 対象外", () => {
      expect(isRetryableGoogleApiError({ code: "EACCES" })).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("null / undefined は retry 対象外", () => {
      expect(isRetryableGoogleApiError(null)).toBe(false);
      expect(isRetryableGoogleApiError(undefined)).toBe(false);
    });

    test("primitive は retry 対象外", () => {
      expect(isRetryableGoogleApiError("error")).toBe(false);
      expect(isRetryableGoogleApiError(123)).toBe(false);
    });
  });
});

describe("withGoogleApiRetry", () => {
  test("成功時は即座に結果を返す", async () => {
    let calls = 0;
    const result = await withGoogleApiRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retry 対象でないエラーは即座にスロー（retry なし）", async () => {
    let calls = 0;
    await expect(
      withGoogleApiRetry(async () => {
        calls++;
        throw { code: 404, message: "Not Found" };
      }),
    ).rejects.toMatchObject({ code: 404 });
    expect(calls).toBe(1);
  });

  test("403 rateLimitExceeded は retry される", async () => {
    let calls = 0;
    const result = await withGoogleApiRetry(
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
      withGoogleApiRetry(
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
    const result = await withGoogleApiRetry(
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
