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
  isGoogleCalendarFullSyncRequired,
  isRetryableGoogleApiError,
  withGoogleApiRetry,
} from "@/shared/lib/google-api/retry";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  describe("gRPC Status ベースの retry 判定", () => {
    test("UNAVAILABLE (14) は retry 対象", () => {
      expect(isRetryableGoogleApiError({ code: 14 })).toBe(true);
    });

    test("DEADLINE_EXCEEDED (4) / RESOURCE_EXHAUSTED (8) / INTERNAL (13) は retry 対象", () => {
      expect(isRetryableGoogleApiError({ code: 4 })).toBe(true);
      expect(isRetryableGoogleApiError({ code: 8 })).toBe(true);
      expect(isRetryableGoogleApiError({ code: 13 })).toBe(true);
    });

    test("HTTP 400 は gRPC 分岐でも retry 対象外のまま", () => {
      expect(isRetryableGoogleApiError({ code: 400 })).toBe(false);
    });

    test("HTTP 429 は gRPC 分岐を足しても retry 対象のまま", () => {
      expect(isRetryableGoogleApiError({ code: 429 })).toBe(true);
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

describe("isGoogleCalendarFullSyncRequired", () => {
  test("HTTP status 410 は true（公式本文メッセージは '410' という文字列を含まない）", () => {
    expect(isGoogleCalendarFullSyncRequired({ code: 410 })).toBe(true);
    expect(isGoogleCalendarFullSyncRequired({ status: 410 })).toBe(true);
    expect(
      isGoogleCalendarFullSyncRequired({ response: { status: 410 } }),
    ).toBe(true);
  });

  test("message に '410' を含まない実際の Google 本文でも status 410 なら true", () => {
    const error = {
      code: 410,
      message: "Sync token is no longer valid, a full sync is required.",
    };
    expect(isGoogleCalendarFullSyncRequired(error)).toBe(true);
  });

  test("reason が fullSyncRequired なら status 欠落でも true", () => {
    const error = {
      errors: [{ domain: "calendar", reason: "fullSyncRequired" }],
    };
    expect(isGoogleCalendarFullSyncRequired(error)).toBe(true);
  });

  test("GaxiosError 形式（response.data.error.errors）でも reason を抽出できる", () => {
    const error = {
      response: {
        data: {
          error: {
            errors: [{ domain: "calendar", reason: "fullSyncRequired" }],
          },
        },
      },
    };
    expect(isGoogleCalendarFullSyncRequired(error)).toBe(true);
  });

  test("400 / 401 / 403 / 404 は false（410 と取り違えない）", () => {
    expect(isGoogleCalendarFullSyncRequired({ code: 400 })).toBe(false);
    expect(isGoogleCalendarFullSyncRequired({ code: 401 })).toBe(false);
    expect(isGoogleCalendarFullSyncRequired({ code: 403 })).toBe(false);
    expect(isGoogleCalendarFullSyncRequired({ code: 404 })).toBe(false);
  });

  test("message に偶然 '410' を含む無関係なエラーは true にしない（文字列一致の誤検知回避）", () => {
    const error = { code: 500, message: "Internal error at line 410" };
    expect(isGoogleCalendarFullSyncRequired(error)).toBe(false);
  });

  test("null / undefined / primitive は false", () => {
    expect(isGoogleCalendarFullSyncRequired(null)).toBe(false);
    expect(isGoogleCalendarFullSyncRequired(undefined)).toBe(false);
    expect(isGoogleCalendarFullSyncRequired("error")).toBe(false);
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

  test("gRPC UNAVAILABLE (14) は retry される", async () => {
    let calls = 0;
    const result = await withGoogleApiRetry(
      async () => {
        calls++;
        if (calls < 2) throw { code: 14 };
        return "ok";
      },
      { maxRetries: 2 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
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
        shouldRetry: (error) => isRecord(error) && error["code"] === 418,
      },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
