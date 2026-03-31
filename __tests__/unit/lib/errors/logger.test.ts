/**
 * エラーロガーテスト
 *
 * src/shared/lib/errors/logger.ts のユニットテスト
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { logError, createErrorLogger } from "@/shared/lib/errors/logger-core";
import {
  normalizeError,
  getErrorMessage,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/types";
import type { ErrorLogContext } from "@/shared/lib/errors/types";

// console.error をモック化
const originalConsoleError = console.error;
const originalNodeEnv = process.env["NODE_ENV"];
const mockConsoleError = mock<(message?: unknown, ...args: unknown[]) => void>(
  () => {},
);

beforeEach(() => {
  mockConsoleError.mockClear();
  console.error = mockConsoleError as any;
});

afterEach(() => {
  console.error = originalConsoleError;
  process.env["NODE_ENV"] = originalNodeEnv;
});

// =============================================================================
// normalizeError
// =============================================================================

describe("normalizeError", () => {
  test("Errorインスタンスはそのまま返す", () => {
    const error = new Error("テストエラー");
    const result = normalizeError(error);
    expect(result).toBe(error);
    expect(result.message).toBe("テストエラー");
  });

  test("Errorサブクラスはそのまま返す", () => {
    const error = new TypeError("型エラー");
    const result = normalizeError(error);
    expect(result).toBe(error);
    expect(result.message).toBe("型エラー");
    expect(result).toBeInstanceOf(TypeError);
  });

  test("文字列をErrorオブジェクトに変換する", () => {
    const result = normalizeError("文字列エラー");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("文字列エラー");
  });

  test("数値をErrorオブジェクトに変換する", () => {
    const result = normalizeError(42);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("42");
  });

  test("nullをErrorオブジェクトに変換する", () => {
    const result = normalizeError(null);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("null");
  });

  test("undefinedをErrorオブジェクトに変換する", () => {
    const result = normalizeError(undefined);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("undefined");
  });

  test("オブジェクトをErrorオブジェクトに変換する", () => {
    const result = normalizeError({ code: "ERR_001" });
    expect(result).toBeInstanceOf(Error);
    // String({ code: 'ERR_001' }) = '[object Object]'
    expect(result.message).toBe("[object Object]");
  });

  test("booleanをErrorオブジェクトに変換する", () => {
    const result = normalizeError(false);
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("false");
  });
});

// =============================================================================
// getErrorMessage
// =============================================================================

describe("getErrorMessage", () => {
  test("Errorインスタンスからメッセージを取得する", () => {
    const result = getErrorMessage(new Error("エラーメッセージ"));
    expect(result).toBe("エラーメッセージ");
  });

  test("Errorサブクラスからメッセージを取得する", () => {
    const result = getErrorMessage(new TypeError("型エラーメッセージ"));
    expect(result).toBe("型エラーメッセージ");
  });

  test("文字列はそのまま返す", () => {
    const result = getErrorMessage("文字列エラー");
    expect(result).toBe("文字列エラー");
  });

  test("数値を文字列に変換する", () => {
    const result = getErrorMessage(500);
    expect(result).toBe("500");
  });

  test("nullを文字列に変換する", () => {
    const result = getErrorMessage(null);
    expect(result).toBe("null");
  });

  test("undefinedを文字列に変換する", () => {
    const result = getErrorMessage(undefined);
    expect(result).toBe("undefined");
  });

  test("booleanを文字列に変換する", () => {
    expect(getErrorMessage(true)).toBe("true");
    expect(getErrorMessage(false)).toBe("false");
  });
});

// =============================================================================
// logError
// =============================================================================

describe("logError", () => {
  const baseContext: ErrorLogContext = {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
  };

  describe("基本動作", () => {
    test("Errorオブジェクトでconsole.errorが呼ばれる", () => {
      logError(new Error("テストエラー"), baseContext);
      expect(console.error).toHaveBeenCalled();
    });

    test("文字列エラーでconsole.errorが呼ばれる", () => {
      logError("文字列エラー", baseContext);
      expect(console.error).toHaveBeenCalled();
    });

    test("undefinedエラーでconsole.errorが呼ばれる", () => {
      logError(undefined, baseContext);
      expect(console.error).toHaveBeenCalled();
    });

    test("nullエラーでconsole.errorが呼ばれる", () => {
      logError(null, baseContext);
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("コンテキスト情報", () => {
    test("追加コンテキストが含まれる", () => {
      logError(new Error("test"), {
        ...baseContext,
        context: { table: "users", id: "123" },
      });
      expect(console.error).toHaveBeenCalled();
    });

    test("userIdが含まれる", () => {
      logError(new Error("test"), {
        ...baseContext,
        userId: "user-123",
      });
      expect(console.error).toHaveBeenCalled();
    });

    test("timestampが含まれる", () => {
      const timestamp = new Date("2026-01-01T00:00:00Z");
      logError(new Error("test"), {
        ...baseContext,
        timestamp,
      });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe("本番環境", () => {
    test("GCP構造化JSON形式で出力される", () => {
      process.env["NODE_ENV"] = "production";
      logError(new Error("本番エラー"), baseContext);
      expect(console.error).toHaveBeenCalledTimes(1);

      const mockFn = console.error as ReturnType<typeof mock>;
      const firstCallArg = mockFn.mock.calls[0][0];
      expect(typeof firstCallArg).toBe("string");

      const parsed = JSON.parse(firstCallArg);
      expect(parsed.message).toBe("本番エラー");
      expect(parsed.category).toBe("DATABASE");
      // ErrorSeverity.MEDIUM → GCP LogSeverity "WARNING"
      expect(parsed.severity).toBe("WARNING");
      expect(parsed.serviceContext).toBeDefined();
      expect(parsed.serviceContext.service).toBe("myrrh-rental-space");
      expect(parsed.timestamp).toBeDefined();
    });

    test("ERROR以上でstack_traceと@typeが付与される", () => {
      process.env["NODE_ENV"] = "production";
      logError(new Error("重大エラー"), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
      });

      const mockFn = console.error as ReturnType<typeof mock>;
      const parsed = JSON.parse(mockFn.mock.calls[0][0]);
      expect(parsed.severity).toBe("ERROR");
      expect(parsed.stack_trace).toBeDefined();
      expect(parsed["@type"]).toBe(
        "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
      );
    });

    test("WARNING以下ではstack_traceと@typeは付与されない", () => {
      process.env["NODE_ENV"] = "production";
      logError(new Error("軽微エラー"), baseContext);

      const mockFn = console.error as ReturnType<typeof mock>;
      const parsed = JSON.parse(mockFn.mock.calls[0][0]);
      expect(parsed.severity).toBe("WARNING");
      expect(parsed.stack_trace).toBeUndefined();
      expect(parsed["@type"]).toBeUndefined();
    });
  });

  describe("開発環境", () => {
    test("オブジェクト形式で出力される", () => {
      process.env["NODE_ENV"] = "development";
      logError(new Error("開発エラー"), baseContext);
      expect(console.error).toHaveBeenCalledTimes(1);

      const mockFn = console.error as ReturnType<typeof mock>;
      const firstArg = mockFn.mock.calls[0][0];
      const secondArg = mockFn.mock.calls[0][1];
      expect(firstArg).toBe("[Error]");
      expect(secondArg.message).toBe("開発エラー");
    });
  });

  describe("エラー種別ごとのメッセージ抽出", () => {
    test("Errorオブジェクトからmessageを抽出する", () => {
      process.env["NODE_ENV"] = "production";
      logError(new Error("Errorメッセージ"), baseContext);
      const mockFn = console.error as ReturnType<typeof mock>;
      const parsed = JSON.parse(mockFn.mock.calls[0][0]);
      expect(parsed.message).toBe("Errorメッセージ");
    });

    test("文字列からメッセージを抽出する", () => {
      process.env["NODE_ENV"] = "production";
      logError("文字列メッセージ", baseContext);
      const mockFn = console.error as ReturnType<typeof mock>;
      const parsed = JSON.parse(mockFn.mock.calls[0][0]);
      expect(parsed.message).toBe("文字列メッセージ");
    });

    test("Errorオブジェクトの場合ERROR以上でstack_traceが含まれる", () => {
      process.env["NODE_ENV"] = "production";
      const error = new Error("stackテスト");
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
      });
      const mockFn = console.error as ReturnType<typeof mock>;
      const parsed = JSON.parse(mockFn.mock.calls[0][0]);
      expect(parsed.stack_trace).toBeDefined();
      expect(typeof parsed.stack_trace).toBe("string");
    });

    test("非ErrorでERROR以上の場合フォールバックstack_traceが生成される", () => {
      process.env["NODE_ENV"] = "production";
      logError("string error", {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
      });
      const mockFn = console.error as ReturnType<typeof mock>;
      const parsed = JSON.parse(mockFn.mock.calls[0][0]);
      expect(parsed.stack_trace).toContain("Error: string error");
    });
  });
});

// =============================================================================
// createErrorLogger
// =============================================================================

describe("createErrorLogger", () => {
  test("スコープ付きロガーを作成できる", () => {
    const dbLogger = createErrorLogger({
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
    });

    expect(typeof dbLogger).toBe("function");
  });

  test("スコープ付きロガーでconsole.errorが呼ばれる", () => {
    const dbLogger = createErrorLogger({
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
    });

    dbLogger(new Error("DBエラー"));
    expect(console.error).toHaveBeenCalled();
  });

  test("追加コンテキストを上書きできる", () => {
    process.env["NODE_ENV"] = "production";
    const logger = createErrorLogger({
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
    });

    logger(new Error("上書きテスト"), {
      severity: ErrorSeverity.HIGH,
      context: { detail: "extra" },
    });

    const mockFn = console.error as ReturnType<typeof mock>;
    const parsed = JSON.parse(mockFn.mock.calls[0][0]);
    // ErrorSeverity.HIGH → GCP LogSeverity "ERROR"
    expect(parsed.severity).toBe("ERROR");
    expect(parsed.context).toEqual({ detail: "extra" });
  });

  test("デフォルトコンテキストがマージされる", () => {
    process.env["NODE_ENV"] = "production";
    const logger = createErrorLogger({
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      userId: "default-user",
    });

    logger(new Error("マージテスト"));

    const mockFn = console.error as ReturnType<typeof mock>;
    const parsed = JSON.parse(mockFn.mock.calls[0][0]);
    expect(parsed.category).toBe("EXTERNAL_API");
    // ErrorSeverity.MEDIUM → GCP LogSeverity "WARNING"
    expect(parsed.severity).toBe("WARNING");
    expect(parsed.userId).toBe("default-user");
  });
});

// =============================================================================
// ErrorCategory / ErrorSeverity 定数
// =============================================================================

describe("ErrorCategory", () => {
  test("全カテゴリが定義されている", () => {
    expect(ErrorCategory.DATABASE).toBe("DATABASE");
    expect(ErrorCategory.EXTERNAL_API).toBe("EXTERNAL_API");
    expect(ErrorCategory.VALIDATION).toBe("VALIDATION");
    expect(ErrorCategory.AUTHORIZATION).toBe("AUTHORIZATION");
    expect(ErrorCategory.CACHE).toBe("CACHE");
    expect(ErrorCategory.UNKNOWN).toBe("UNKNOWN");
  });
});

describe("ErrorSeverity", () => {
  test("全深刻度が定義されている", () => {
    expect(ErrorSeverity.CRITICAL).toBe("CRITICAL");
    expect(ErrorSeverity.HIGH).toBe("HIGH");
    expect(ErrorSeverity.MEDIUM).toBe("MEDIUM");
    expect(ErrorSeverity.LOW).toBe("LOW");
  });
});
