/**
 * async-utils ユニットテスト
 *
 * src/shared/lib/async-utils.ts のテスト
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// logError / normalizeError をモック（server-only 依存を回避）
const mockLogError = mock(() => undefined);
const mockNormalizeError = mock((err: unknown) => {
  if (err instanceof Error) return err;
  return new Error(String(err));
});

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  createErrorLogger: mock(() => ({
    error: mock(),
    warn: mock(),
    info: mock(),
  })),
  normalizeError: mockNormalizeError,
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ReservationOverlapError: class extends Error {
    readonly code = "RESERVATION_OVERLAP" as const;
    constructor(message = "選択された時間帯は既に予約されています") {
      super(message);
      this.name = "ReservationOverlapError";
    }
  },
  isReservationOverlapError: (error: unknown) =>
    error instanceof Error && error.name === "ReservationOverlapError",
  safeFetch: mock(async (opts: { fetch: () => unknown; fallback: unknown }) => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  }),
  criticalFetch: mock(async (opts: { fetch: () => unknown }) => opts.fetch()),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

import {
  withTimeout,
  withRetry,
  fireAndForget,
  settleAllWithLogging,
} from "@/shared/lib/async-utils";

// =============================================================================
// withTimeout
// =============================================================================

describe("withTimeout", () => {
  describe("正常系", () => {
    test("タイムアウト前に完了した Promise はそのまま解決される", async () => {
      const result = await withTimeout(Promise.resolve("成功"), 1000);
      expect(result).toBe("成功");
    });

    test("数値を返す Promise も正常に解決される", async () => {
      const result = await withTimeout(Promise.resolve(42), 1000);
      expect(result).toBe(42);
    });

    test("オブジェクトを返す Promise も正常に解決される", async () => {
      const obj = { id: 1, name: "テスト" };
      const result = await withTimeout(Promise.resolve(obj), 1000);
      expect(result).toEqual(obj);
    });
  });

  describe("タイムアウト発生", () => {
    test("タイムアウトを超えた Promise はデフォルトメッセージでリジェクトされる", async () => {
      const neverResolves = new Promise<never>(() => {});
      await expect(withTimeout(neverResolves, 50)).rejects.toThrow(
        "Operation timed out",
      );
    });

    test("カスタムタイムアウトメッセージが使用される", async () => {
      const neverResolves = new Promise<never>(() => {});
      await expect(
        withTimeout(neverResolves, 50, "カスタムタイムアウトメッセージ"),
      ).rejects.toThrow("カスタムタイムアウトメッセージ");
    });

    test("タイムアウト時に Error インスタンスがスローされる", async () => {
      const neverResolves = new Promise<never>(() => {});
      await expect(withTimeout(neverResolves, 50)).rejects.toBeInstanceOf(
        Error,
      );
    });
  });

  describe("エッジケース", () => {
    test("Promise が先に失敗した場合はその Error が伝播する", async () => {
      const failingPromise = Promise.reject(new Error("元のエラー"));
      await expect(withTimeout(failingPromise, 1000)).rejects.toThrow(
        "元のエラー",
      );
    });
  });
});

// =============================================================================
// withRetry
// =============================================================================

describe("withRetry", () => {
  describe("正常系", () => {
    test("初回で成功した場合はリトライなしで結果を返す", async () => {
      const fn = mock(() => Promise.resolve("初回成功"));
      const result = await withRetry(fn, { maxRetries: 3, delayMs: 0 });
      expect(result).toBe("初回成功");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test("2回目で成功した場合は結果を返す", async () => {
      let callCount = 0;
      const fn = mock(() => {
        callCount++;
        if (callCount < 2) return Promise.reject(new Error("一時失敗"));
        return Promise.resolve("2回目成功");
      });
      const result = await withRetry(fn, { maxRetries: 3, delayMs: 0 });
      expect(result).toBe("2回目成功");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test("最大リトライ回数の直前で成功した場合は結果を返す", async () => {
      let callCount = 0;
      const fn = mock(() => {
        callCount++;
        if (callCount <= 3) return Promise.reject(new Error("失敗"));
        return Promise.resolve("最後に成功");
      });
      const result = await withRetry(fn, { maxRetries: 3, delayMs: 0 });
      expect(result).toBe("最後に成功");
      expect(fn).toHaveBeenCalledTimes(4);
    });
  });

  describe("異常系", () => {
    test("最大リトライ回数を超えた場合は最後のエラーをスローする", async () => {
      const fn = mock(() => Promise.reject(new Error("常に失敗")));
      await expect(
        withRetry(fn, { maxRetries: 2, delayMs: 0 }),
      ).rejects.toThrow("常に失敗");
      // 最大リトライ 2 = 初回 + 2回リトライ = 3回呼ばれる
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test("デフォルト設定（maxRetries: 3）で4回呼ばれる", async () => {
      const fn = mock(() => Promise.reject(new Error("常に失敗")));
      await expect(withRetry(fn, { delayMs: 0 })).rejects.toThrow("常に失敗");
      expect(fn).toHaveBeenCalledTimes(4);
    });
  });

  describe("shouldRetry", () => {
    test("shouldRetry が false を返した場合は即座に失敗する", async () => {
      const fn = mock(() => Promise.reject(new Error("即座失敗")));
      const shouldRetry = mock(() => false);
      await expect(
        withRetry(fn, { maxRetries: 3, delayMs: 0, shouldRetry }),
      ).rejects.toThrow("即座失敗");
      // shouldRetry が false のため初回のみ呼ばれる
      expect(fn).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledTimes(1);
    });

    test("shouldRetry がエラーオブジェクトを受け取る", async () => {
      const targetError = new Error("リトライ判定エラー");
      const fn = mock(() => Promise.reject(targetError));
      const shouldRetry = mock((_err: unknown) => false);
      await expect(
        withRetry(fn, { maxRetries: 3, delayMs: 0, shouldRetry }),
      ).rejects.toThrow("リトライ判定エラー");
      expect(shouldRetry).toHaveBeenCalledWith(targetError);
    });

    test("特定エラーのみリトライし、そうでないエラーは即停止する", async () => {
      let callCount = 0;
      const fn = mock(() => {
        callCount++;
        if (callCount === 1)
          return Promise.reject(new Error("リトライ対象エラー"));
        return Promise.reject(new Error("リトライ非対象エラー"));
      });
      const shouldRetry = mock((err: unknown) => {
        return err instanceof Error && err.message === "リトライ対象エラー";
      });
      await expect(
        withRetry(fn, { maxRetries: 3, delayMs: 0, shouldRetry }),
      ).rejects.toThrow("リトライ非対象エラー");
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("バックオフ", () => {
    test("backoffMultiplier: 1 でディレイが変化しない", async () => {
      // delayMs: 0 なので実際の遅延テストは不要。呼び出し回数のみ確認
      const fn = mock(() => Promise.reject(new Error("失敗")));
      await expect(
        withRetry(fn, { maxRetries: 2, delayMs: 0, backoffMultiplier: 1 }),
      ).rejects.toThrow("失敗");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test("maxRetries: 0 の場合は初回のみ呼ばれリトライなし", async () => {
      const fn = mock(() => Promise.reject(new Error("即失敗")));
      await expect(
        withRetry(fn, { maxRetries: 0, delayMs: 0 }),
      ).rejects.toThrow("即失敗");
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// fireAndForget
// =============================================================================

describe("fireAndForget", () => {
  beforeEach(() => {
    mockLogError.mockClear();
    mockNormalizeError.mockClear();
  });

  describe("正常系", () => {
    test("成功した Promise は logError を呼ばない", async () => {
      fireAndForget(Promise.resolve("成功"), { operation: "testOp" });
      // microtask が完了するまで待機
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockLogError).not.toHaveBeenCalled();
    });

    test("void を返す（Promise ではない）", () => {
      const result = fireAndForget(Promise.resolve("成功"), {
        operation: "testOp",
      });
      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    // Promise.reject() は即座に rejected になり、Bun テストランナーが
    // "Unhandled error between tests" として検出する場合がある。
    // queueMicrotask で遅延拒否し、fireAndForget の .catch() が先に登録されるようにする。
    function createDeferredRejection(error: Error): Promise<never> {
      return new Promise<never>((_, reject) => {
        queueMicrotask(() => reject(error));
      });
    }

    test("Promise が失敗した場合 logError が呼ばれる", async () => {
      fireAndForget(createDeferredRejection(new Error("失敗エラー")), {
        operation: "failOp",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    test("operation 名がコンテキストに含まれる", async () => {
      fireAndForget(createDeferredRejection(new Error("エラー")), {
        operation: "myOperation",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({ operation: "myOperation" }),
        }),
      );
    });

    test("追加コンテキストが logError に渡される", async () => {
      fireAndForget(createDeferredRejection(new Error("エラー")), {
        operation: "contextOp",
        context: { userId: "user-1", detail: "test" },
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "contextOp",
            userId: "user-1",
            detail: "test",
          }),
        }),
      );
    });

    test("normalizeError が呼ばれる", async () => {
      const error = new Error("正規化エラー");
      fireAndForget(createDeferredRejection(error), {
        operation: "normalizeOp",
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockNormalizeError).toHaveBeenCalledWith(error);
    });
  });
});

// =============================================================================
// settleAllWithLogging
// =============================================================================

describe("settleAllWithLogging", () => {
  beforeEach(() => {
    mockLogError.mockClear();
    mockNormalizeError.mockClear();
  });

  describe("全成功", () => {
    test("全 Promise が成功した場合は fulfilled 結果を返す", async () => {
      const results = await settleAllWithLogging(
        [Promise.resolve(1), Promise.resolve(2), Promise.resolve(3)],
        { operationPrefix: "testOp" },
      );
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
      expect(results[1]).toEqual({ status: "fulfilled", value: 2 });
      expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
    });

    test("全成功の場合 logError は呼ばれない", async () => {
      await settleAllWithLogging([Promise.resolve("a"), Promise.resolve("b")], {
        operationPrefix: "allSuccessOp",
      });
      expect(mockLogError).not.toHaveBeenCalled();
    });
  });

  describe("一部失敗", () => {
    test("失敗した Promise の分だけ logError が呼ばれる", async () => {
      await settleAllWithLogging(
        [
          Promise.resolve("成功"),
          Promise.reject(new Error("失敗1")),
          Promise.resolve("成功2"),
          Promise.reject(new Error("失敗2")),
        ],
        { operationPrefix: "partialOp" },
      );
      expect(mockLogError).toHaveBeenCalledTimes(2);
    });

    test("失敗のインデックスが operation に含まれる", async () => {
      await settleAllWithLogging(
        [Promise.resolve("ok"), Promise.reject(new Error("失敗"))],
        { operationPrefix: "indexOp" },
      );
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({ operation: "indexOp[1]" }),
        }),
      );
    });

    test("全結果配列（fulfilled / rejected 両方）を返す", async () => {
      const error = new Error("失敗エラー");
      const results = await settleAllWithLogging(
        [Promise.resolve("ok"), Promise.reject(error)],
        { operationPrefix: "mixedOp" },
      );
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ status: "fulfilled", value: "ok" });
      expect(results[1]).toEqual({ status: "rejected", reason: error });
    });
  });

  describe("全失敗", () => {
    test("全 Promise が失敗した場合は全て rejected を返す", async () => {
      const results = await settleAllWithLogging(
        [
          Promise.reject(new Error("失敗A")),
          Promise.reject(new Error("失敗B")),
        ],
        { operationPrefix: "allFailOp" },
      );
      expect(results).toHaveLength(2);
      expect(results[0]?.status).toBe("rejected");
      expect(results[1]?.status).toBe("rejected");
    });

    test("全失敗でも logError が各失敗に対して呼ばれる", async () => {
      await settleAllWithLogging(
        [
          Promise.reject(new Error("失敗X")),
          Promise.reject(new Error("失敗Y")),
          Promise.reject(new Error("失敗Z")),
        ],
        { operationPrefix: "allFailLog" },
      );
      expect(mockLogError).toHaveBeenCalledTimes(3);
    });

    test("全失敗でも関数自体はリジェクトされない（settled を返す）", async () => {
      const promise = settleAllWithLogging(
        [Promise.reject(new Error("失敗"))],
        { operationPrefix: "noThrow" },
      );
      await expect(promise).resolves.toBeDefined();
    });
  });

  describe("エッジケース", () => {
    test("空配列を渡すと空配列を返す", async () => {
      const results = await settleAllWithLogging<string>([], {
        operationPrefix: "emptyOp",
      });
      expect(results).toEqual([]);
      expect(mockLogError).not.toHaveBeenCalled();
    });

    test("追加コンテキストが logError に渡される", async () => {
      await settleAllWithLogging([Promise.reject(new Error("エラー"))], {
        operationPrefix: "ctxOp",
        context: { batchId: "batch-1" },
      });
      expect(mockLogError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          context: expect.objectContaining({ batchId: "batch-1" }),
        }),
      );
    });
  });
});
