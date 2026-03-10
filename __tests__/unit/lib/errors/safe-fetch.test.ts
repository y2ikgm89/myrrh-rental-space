/**
 * safeFetch / criticalFetch テスト
 *
 * src/shared/lib/errors/safe-fetch.ts のユニットテスト
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  safeFetch,
  criticalFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/safe-fetch";

// console.error をモック化してログ出力を検証
const originalConsoleError = console.error;

beforeEach(() => {
  console.error = mock(() => {});
});

afterEach(() => {
  console.error = originalConsoleError;
});

// =============================================================================
// safeFetch
// =============================================================================

describe("safeFetch", () => {
  describe("正常系", () => {
    test("fetchコールバックの戻り値をそのまま返す", async () => {
      const data = { id: "1", name: "テスト" };
      const result = await safeFetch({
        fetch: () => Promise.resolve(data),
        fallback: null,
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        operationName: "testFetch",
      });
      expect(result).toEqual(data);
    });

    test("配列を返すfetchでも正しく動作する", async () => {
      const items = [{ id: "1" }, { id: "2" }];
      const result = await safeFetch({
        fetch: () => Promise.resolve(items),
        fallback: [],
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        operationName: "getItems",
      });
      expect(result).toEqual(items);
    });

    test("nullを返すfetchでも正しく動作する", async () => {
      const result = await safeFetch({
        fetch: () => Promise.resolve(null),
        fallback: { default: true },
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        operationName: "getNullable",
      });
      expect(result).toBeNull();
    });

    test("成功時はconsole.errorが呼ばれない", async () => {
      await safeFetch({
        fetch: () => Promise.resolve("ok"),
        fallback: "",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        operationName: "successTest",
      });
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("異常系", () => {
    test("fetchが例外を投げるとfallback値を返す", async () => {
      const fallbackData = { items: [], total: 0 };
      const result = await safeFetch({
        fetch: () => Promise.reject(new Error("DB接続エラー")),
        fallback: fallbackData,
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        operationName: "failingFetch",
      });
      expect(result).toEqual(fallbackData);
    });

    test("fetchが例外を投げると空配列のfallbackを返す", async () => {
      const result = await safeFetch({
        fetch: (): Promise<string[]> => Promise.reject(new Error("error")),
        fallback: [],
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        operationName: "failingListFetch",
      });
      expect(result).toEqual([]);
    });

    test("fetchが例外を投げるとnullのfallbackを返す", async () => {
      const result = await safeFetch({
        fetch: (): Promise<{ id: string } | null> =>
          Promise.reject(new Error("not found")),
        fallback: null,
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
        operationName: "failingNullFetch",
      });
      expect(result).toBeNull();
    });

    test("エラー時にconsole.errorが呼ばれる（ロギング確認）", async () => {
      await safeFetch({
        fetch: () => Promise.reject(new Error("テストエラー")),
        fallback: null,
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        operationName: "logTest",
      });
      expect(console.error).toHaveBeenCalled();
    });

    test("文字列エラーでもfallbackを返す", async () => {
      const result = await safeFetch({
        fetch: () => Promise.reject("string error"),
        fallback: "default",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        operationName: "stringErrorTest",
      });
      expect(result).toBe("default");
    });

    test("contextが渡される場合もfallbackを返す", async () => {
      const result = await safeFetch({
        fetch: (): Promise<number> => Promise.reject(new Error("fail")),
        fallback: 0,
        category: ErrorCategory.CACHE,
        severity: ErrorSeverity.LOW,
        operationName: "contextTest",
        context: { table: "users", id: "123" },
      });
      expect(result).toBe(0);
    });
  });

  describe("各ErrorCategory", () => {
    const categories = [
      ErrorCategory.DATABASE,
      ErrorCategory.EXTERNAL_API,
      ErrorCategory.VALIDATION,
      ErrorCategory.AUTHORIZATION,
      ErrorCategory.CACHE,
      ErrorCategory.UNKNOWN,
    ];

    for (const category of categories) {
      test(`${category} カテゴリでエラー時にfallbackを返す`, async () => {
        const result = await safeFetch({
          fetch: (): Promise<string> => Promise.reject(new Error("fail")),
          fallback: "fallback",
          category,
          severity: ErrorSeverity.LOW,
          operationName: `test-${category}`,
        });
        expect(result).toBe("fallback");
      });
    }
  });

  describe("各ErrorSeverity", () => {
    const severities = [
      ErrorSeverity.CRITICAL,
      ErrorSeverity.HIGH,
      ErrorSeverity.MEDIUM,
      ErrorSeverity.LOW,
    ];

    for (const severity of severities) {
      test(`${severity} 深刻度でエラー時にfallbackを返す`, async () => {
        const result = await safeFetch({
          fetch: (): Promise<string> => Promise.reject(new Error("fail")),
          fallback: "fallback",
          category: ErrorCategory.DATABASE,
          severity,
          operationName: `test-${severity}`,
        });
        expect(result).toBe("fallback");
      });
    }
  });
});

// =============================================================================
// criticalFetch
// =============================================================================

describe("criticalFetch", () => {
  describe("正常系", () => {
    test("fetchコールバックの戻り値をそのまま返す", async () => {
      const data = { id: "1", title: "テスト記事" };
      const result = await criticalFetch({
        fetch: () => Promise.resolve(data),
        category: ErrorCategory.DATABASE,
        operationName: "getCriticalData",
      });
      expect(result).toEqual(data);
    });

    test("成功時はconsole.errorが呼ばれない", async () => {
      await criticalFetch({
        fetch: () => Promise.resolve("ok"),
        category: ErrorCategory.DATABASE,
        operationName: "successCritical",
      });
      expect(console.error).not.toHaveBeenCalled();
    });
  });

  describe("異常系", () => {
    test("fetchが例外を投げると例外を再スローする", async () => {
      const error = new Error("DBクリティカルエラー");

      await expect(
        criticalFetch({
          fetch: () => Promise.reject(error),
          category: ErrorCategory.DATABASE,
          operationName: "criticalFail",
        }),
      ).rejects.toThrow("DBクリティカルエラー");
    });

    test("エラー時にconsole.errorが呼ばれる", async () => {
      try {
        await criticalFetch({
          fetch: () => Promise.reject(new Error("criticalError")),
          category: ErrorCategory.DATABASE,
          operationName: "criticalLogTest",
        });
      } catch {
        // エラーは握りつぶし
      }
      expect(console.error).toHaveBeenCalled();
    });

    test("元のエラーオブジェクトがそのまま再スローされる", async () => {
      const originalError = new Error("original error");

      try {
        await criticalFetch({
          fetch: () => Promise.reject(originalError),
          category: ErrorCategory.EXTERNAL_API,
          operationName: "originalErrorTest",
        });
        // ここに到達したら失敗
        expect(true).toBe(false);
      } catch (caught) {
        expect(caught).toBe(originalError);
      }
    });

    test("contextが渡される場合もエラーを再スローする", async () => {
      await expect(
        criticalFetch({
          fetch: () => Promise.reject(new Error("with context")),
          category: ErrorCategory.DATABASE,
          operationName: "contextCritical",
          context: { postId: "456" },
        }),
      ).rejects.toThrow("with context");
    });
  });
});

// =============================================================================
// Re-exports
// =============================================================================

describe("re-exports", () => {
  test("ErrorCategory が正しくエクスポートされている", () => {
    expect(ErrorCategory.DATABASE).toBe("DATABASE");
    expect(ErrorCategory.EXTERNAL_API).toBe("EXTERNAL_API");
    expect(ErrorCategory.VALIDATION).toBe("VALIDATION");
    expect(ErrorCategory.AUTHORIZATION).toBe("AUTHORIZATION");
    expect(ErrorCategory.CACHE).toBe("CACHE");
    expect(ErrorCategory.UNKNOWN).toBe("UNKNOWN");
  });

  test("ErrorSeverity が正しくエクスポートされている", () => {
    expect(ErrorSeverity.CRITICAL).toBe("CRITICAL");
    expect(ErrorSeverity.HIGH).toBe("HIGH");
    expect(ErrorSeverity.MEDIUM).toBe("MEDIUM");
    expect(ErrorSeverity.LOW).toBe("LOW");
  });
});
