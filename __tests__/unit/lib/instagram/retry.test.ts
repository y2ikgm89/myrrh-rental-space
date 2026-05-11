/**
 * Instagram Graph API retry wrapper ユニットテスト
 *
 * Meta 公式（https://developers.facebook.com/docs/graph-api/guides/error-handling）の
 * 「HTTP 429 / 5xx + Graph API transient code (1/2/4/17/32/613) は exponential backoff 再試行」
 * が正しく実装されていることを検証する。
 */

import { describe, test, expect } from "bun:test";
import {
  InstagramApiError,
  isRetryableInstagramApiError,
  withInstagramApiRetry,
} from "@/shared/lib/instagram/retry";

describe("InstagramApiError", () => {
  test("statusCode / graphApiCode / graphApiType / message が保持される", () => {
    const error = new InstagramApiError(429, 4, "OAuthException", "rate limit");
    expect(error.statusCode).toBe(429);
    expect(error.graphApiCode).toBe(4);
    expect(error.graphApiType).toBe("OAuthException");
    expect(error.message).toBe("rate limit");
    expect(error.name).toBe("InstagramApiError");
  });

  test("graphApiCode / graphApiType は null 許容", () => {
    const error = new InstagramApiError(500, null, null, "server error");
    expect(error.graphApiCode).toBeNull();
    expect(error.graphApiType).toBeNull();
  });

  test("Error の instance である", () => {
    const error = new InstagramApiError(500, null, null, "x");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InstagramApiError);
  });
});

describe("isRetryableInstagramApiError", () => {
  describe("HTTP status ベースの retry 判定", () => {
    test("429 / 500 / 502 / 503 / 504 は retry 対象", () => {
      for (const status of [429, 500, 502, 503, 504]) {
        const error = new InstagramApiError(status, null, null, "x");
        expect(isRetryableInstagramApiError(error)).toBe(true);
      }
    });

    test("400 / 401 / 403 / 404 / 410 は即時失敗", () => {
      for (const status of [400, 401, 403, 404, 410]) {
        const error = new InstagramApiError(status, null, null, "x");
        expect(isRetryableInstagramApiError(error)).toBe(false);
      }
    });
  });

  describe("Graph API error code ベースの retry 判定", () => {
    test("transient code (1/2) は retry 対象", () => {
      expect(
        isRetryableInstagramApiError(
          new InstagramApiError(400, 1, "OAuthException", "x"),
        ),
      ).toBe(true);
      expect(
        isRetryableInstagramApiError(
          new InstagramApiError(400, 2, "OAuthException", "x"),
        ),
      ).toBe(true);
    });

    test("rate limit code (4/17/32/613) は retry 対象", () => {
      for (const code of [4, 17, 32, 613]) {
        const error = new InstagramApiError(400, code, "OAuthException", "x");
        expect(isRetryableInstagramApiError(error)).toBe(true);
      }
    });

    test("OAUTH_ACCESS_TOKEN_INVALID (190) は即時失敗", () => {
      const error = new InstagramApiError(
        400,
        190,
        "OAuthException",
        "Invalid OAuth access token",
      );
      expect(isRetryableInstagramApiError(error)).toBe(false);
    });

    test("INVALID_PARAMETER (100) は即時失敗", () => {
      const error = new InstagramApiError(
        400,
        100,
        "OAuthException",
        "Invalid Parameter",
      );
      expect(isRetryableInstagramApiError(error)).toBe(false);
    });

    test("不明な Graph API code は即時失敗", () => {
      const error = new InstagramApiError(400, 999, "OAuthException", "x");
      expect(isRetryableInstagramApiError(error)).toBe(false);
    });
  });

  describe("ネットワーク層エラー", () => {
    test("ECONNRESET / ETIMEDOUT / EAI_AGAIN / ENOTFOUND / ECONNREFUSED は retry 対象", () => {
      for (const code of [
        "ECONNRESET",
        "ETIMEDOUT",
        "EAI_AGAIN",
        "ENOTFOUND",
        "ECONNREFUSED",
      ]) {
        expect(isRetryableInstagramApiError({ code })).toBe(true);
      }
    });

    test("不明な system code は retry 対象外", () => {
      expect(isRetryableInstagramApiError({ code: "EACCES" })).toBe(false);
    });
  });

  describe("エッジケース", () => {
    test("null / undefined は retry 対象外", () => {
      expect(isRetryableInstagramApiError(null)).toBe(false);
      expect(isRetryableInstagramApiError(undefined)).toBe(false);
    });

    test("primitive は retry 対象外", () => {
      expect(isRetryableInstagramApiError("error")).toBe(false);
      expect(isRetryableInstagramApiError(123)).toBe(false);
    });

    test("InstagramApiError でない汎用 Error は retry 対象外（status / code フィールドなし）", () => {
      expect(isRetryableInstagramApiError(new Error("generic"))).toBe(false);
    });
  });
});

describe("withInstagramApiRetry", () => {
  test("成功時は即座に結果を返す", async () => {
    let calls = 0;
    const result = await withInstagramApiRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  test("retry 対象でないエラーは即座にスロー（retry なし）", async () => {
    let calls = 0;
    await expect(
      withInstagramApiRetry(async () => {
        calls++;
        throw new InstagramApiError(190, 190, "OAuthException", "invalid");
      }),
    ).rejects.toBeInstanceOf(InstagramApiError);
    expect(calls).toBe(1);
  });

  test("429 (rate limit) は retry される", async () => {
    let calls = 0;
    const result = await withInstagramApiRetry(
      async () => {
        calls++;
        if (calls < 2) {
          throw new InstagramApiError(429, 4, "OAuthException", "rate limit");
        }
        return "ok";
      },
      { maxRetries: 2 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  test("Graph API code 17 (User Rate Limit) は retry される", async () => {
    let calls = 0;
    const result = await withInstagramApiRetry(
      async () => {
        calls++;
        if (calls < 2) {
          throw new InstagramApiError(400, 17, "OAuthException", "user limit");
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
      withInstagramApiRetry(
        async () => {
          calls++;
          throw new InstagramApiError(503, null, null, "unavailable");
        },
        { maxRetries: 1 },
      ),
    ).rejects.toBeInstanceOf(InstagramApiError);
    // 初回 + 1 retry = 2 calls
    expect(calls).toBe(2);
  });

  test("shouldRetry option で追加の retry 条件を注入できる", async () => {
    let calls = 0;
    const result = await withInstagramApiRetry(
      async () => {
        calls++;
        if (calls < 2) throw new Error("custom");
        return "ok";
      },
      {
        maxRetries: 2,
        shouldRetry: (error) =>
          error instanceof Error && error.message === "custom",
      },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  test("ネットワーク層エラー（ECONNRESET）は retry される", async () => {
    let calls = 0;
    const result = await withInstagramApiRetry(
      async () => {
        calls++;
        if (calls < 2) throw { code: "ECONNRESET" };
        return "ok";
      },
      { maxRetries: 2 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });
});
