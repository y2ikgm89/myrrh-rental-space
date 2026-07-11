/**
 * エラーロガーテスト
 *
 * src/shared/lib/errors/logger-core.ts のユニットテスト
 */

import {
  describe,
  test,
  expect,
  spyOn,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { setNodeEnv } from "../../../helpers/env";
import { expectRecord } from "../../../helpers/type-assertions";
import {
  logError,
  createErrorLogger,
  logger,
} from "@/shared/lib/errors/logger-core";
import {
  normalizeError,
  getErrorMessage,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/types";
import type { ErrorLogContext } from "@/shared/lib/errors/types";

function parseLogRecord(rawArg: unknown): Record<string, unknown> {
  if (typeof rawArg !== "string") throw new Error("expected JSON string");
  const parsed: unknown = JSON.parse(rawArg);
  expectRecord(parsed);
  return parsed;
}

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
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("テストエラー"), baseContext);
      expect(spy).toHaveBeenCalled();
    });

    test("文字列エラーでconsole.errorが呼ばれる", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError("文字列エラー", baseContext);
      expect(spy).toHaveBeenCalled();
    });

    test("undefinedエラーでconsole.errorが呼ばれる", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(undefined, baseContext);
      expect(spy).toHaveBeenCalled();
    });

    test("nullエラーでconsole.errorが呼ばれる", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(null, baseContext);
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("コンテキスト情報", () => {
    test("追加コンテキストが含まれる", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("test"), {
        ...baseContext,
        context: { table: "users", id: "123" },
      });
      expect(spy).toHaveBeenCalled();
    });

    test("userIdが含まれる", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("test"), {
        ...baseContext,
        userId: "user-123",
      });
      expect(spy).toHaveBeenCalled();
    });

    test("timestampが含まれる", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      const timestamp = new Date("2026-01-01T00:00:00Z");
      logError(new Error("test"), {
        ...baseContext,
        timestamp,
      });
      expect(spy).toHaveBeenCalled();
    });
  });

  describe("本番環境", () => {
    const originalNodeEnv = process.env["NODE_ENV"];

    beforeAll(() => {
      setNodeEnv("production");
    });

    afterAll(() => {
      setNodeEnv(originalNodeEnv);
    });

    beforeEach(() => {
      setNodeEnv("production");
    });

    test("GCP構造化JSON形式で出力される", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("本番エラー"), baseContext);
      expect(spy).toHaveBeenCalledTimes(1);
      // JSON string が渡されることを確認
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"本番エラー"'),
      );
      // JSON パースして詳細検証
      const calls = spy.mock.calls;
      const firstCall = calls[0];
      if (!firstCall) throw new Error("spy not called");
      const rawArg = firstCall[0];
      if (typeof rawArg !== "string") throw new Error("expected JSON string");
      const parsed: unknown = JSON.parse(rawArg);
      expect(parsed).toMatchObject({
        message: "本番エラー",
        category: "DATABASE",
        // ErrorSeverity.MEDIUM → GCP LogSeverity "WARNING"
        severity: "WARNING",
        serviceContext: expect.objectContaining({
          service: "myrrh-rental-space",
        }),
      });
      expect(parsed).toMatchObject({ timestamp: expect.any(String) });
    });

    test("ERROR以上でstack_traceと@typeが付与される", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("重大エラー"), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
      });
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"severity":"ERROR"'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"stack_trace"'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining(
          '"@type":"type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent"',
        ),
      );
    });

    test("WARNING以下ではstack_traceと@typeは付与されない", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("軽微エラー"), baseContext);
      const calls = spy.mock.calls;
      const firstCall = calls[0];
      if (!firstCall) throw new Error("spy not called");
      const parsed = parseLogRecord(firstCall[0]);
      expect(parsed["severity"]).toBe("WARNING");
      expect(parsed["stack_trace"]).toBeUndefined();
      expect(parsed["@type"]).toBeUndefined();
    });
  });

  describe("開発環境", () => {
    const originalNodeEnv = process.env["NODE_ENV"];

    beforeAll(() => {
      setNodeEnv("development");
    });

    afterAll(() => {
      setNodeEnv(originalNodeEnv);
    });

    test("オブジェクト形式で出力される", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("開発エラー"), baseContext);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        "[Error]",
        expect.objectContaining({ message: "開発エラー" }),
      );
    });
  });

  describe("エラー種別ごとのメッセージ抽出", () => {
    const originalNodeEnv = process.env["NODE_ENV"];

    beforeAll(() => {
      setNodeEnv("production");
    });

    afterAll(() => {
      setNodeEnv(originalNodeEnv);
    });

    beforeEach(() => {
      setNodeEnv("production");
    });

    test("Errorオブジェクトからmessageを抽出する", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("Errorメッセージ"), baseContext);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Errorメッセージ"'),
      );
    });

    test("文字列からメッセージを抽出する", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError("文字列メッセージ", baseContext);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"文字列メッセージ"'),
      );
    });

    test("Errorオブジェクトの場合ERROR以上でstack_traceが含まれる", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("stackテスト");
      logError(error, {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
      });
      const calls = spy.mock.calls;
      const firstCall = calls[0];
      if (!firstCall) throw new Error("spy not called");
      const parsed = parseLogRecord(firstCall[0]);
      expect(typeof parsed["stack_trace"]).toBe("string");
    });

    test("非ErrorでERROR以上の場合フォールバックstack_traceが生成される", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError("string error", {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
      });
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("Error: string error"),
      );
    });
  });
});

// =============================================================================
// PII redaction contract (symmetric)
// =============================================================================
//
// `redactContext` は #977 で config 済み。本ブロックは message / stack_trace の
// symmetric contract を強制する: emit 直前に PII / secret が redact される
// ことを adversarially 検証する。
//
// 生きた bug: `send.ts` の `new Error(\`Email suppressed: ${recipient}\`)` が
// 顧客 email を Cloud Logging へ直流ししていた (Top 5 リスク #1)。

describe("PII redaction contract (message and stack_trace)", () => {
  const originalNodeEnv = process.env["NODE_ENV"];

  afterAll(() => {
    setNodeEnv(originalNodeEnv);
  });

  describe("logError - message (production)", () => {
    beforeEach(() => {
      setNodeEnv("production");
    });

    test("redacts email in Error.message", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("Email suppressed: alice@example.com"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
      });
      const firstCall = spy.mock.calls[0];
      if (!firstCall) throw new Error("spy not called");
      const parsed = parseLogRecord(firstCall[0]);
      expect(String(parsed["message"])).not.toContain("alice@example.com");
      expect(String(parsed["message"])).toContain("[REDACTED:email]");
    });

    test("redacts Japanese phone number in Error.message", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("SMS failed: 090-1234-5678"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(String(parsed["message"])).not.toContain("090-1234-5678");
      expect(String(parsed["message"])).toContain("[REDACTED:phone]");
    });

    test("redacts JWT in Error.message", () => {
      const jwt =
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9FYR3Cq6D8pow";
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error(`Auth failure: ${jwt}`), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(String(parsed["message"])).not.toContain(jwt);
      expect(String(parsed["message"])).toContain("[REDACTED:jwt]");
    });

    test("redacts Bearer token in Error.message", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("Upstream 401: Bearer abc123def456ghi789"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(String(parsed["message"])).not.toContain("abc123def456ghi789");
      expect(String(parsed["message"])).toContain("[REDACTED:bearer]");
    });

    test("preserves UUIDs in Error.message (opaque identifiers, not secrets)", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error(`Reservation not found: ${uuid}`), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(String(parsed["message"])).toContain(uuid);
    });

    test("redacts email in string error (non-Error input path)", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError("Failed for bob@example.com", {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(String(parsed["message"])).not.toContain("bob@example.com");
      expect(String(parsed["message"])).toContain("[REDACTED:email]");
      // stack_trace fallback path も同経路で redact される
      expect(String(parsed["stack_trace"])).not.toContain("bob@example.com");
    });
  });

  describe("logError - stack_trace (production)", () => {
    beforeEach(() => {
      setNodeEnv("production");
    });

    test("redacts email carried in Error.stack at ERROR severity", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      // Error の 1 行目は "Error: <message>" — stack 全体に PII が乗る
      logError(new Error("failure for leaked@example.com"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(parsed["stack_trace"]).toBeDefined();
      expect(String(parsed["stack_trace"])).not.toContain("leaked@example.com");
      expect(String(parsed["stack_trace"])).toContain("[REDACTED:email]");
    });

    test("redacts Bearer token in Error.stack", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("Bearer abc123def456ghi789xyz"), {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.CRITICAL,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(String(parsed["stack_trace"])).not.toContain("abc123def456ghi789");
      expect(String(parsed["stack_trace"])).toContain("[REDACTED:bearer]");
    });

    test("does not truncate typical stack traces (fits under 8 KB budget)", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("boom"), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
      });
      const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
      expect(String(parsed["stack_trace"])).not.toContain("[truncated]");
      expect(String(parsed["stack_trace"])).toContain("Error: boom");
    });
  });

  describe("logError - dev output", () => {
    beforeEach(() => {
      setNodeEnv("development");
    });

    test("redacts email in dev [Error] output message", () => {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      logError(new Error("Email suppressed: dev@example.com"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
      });
      expect(spy).toHaveBeenCalledWith(
        "[Error]",
        expect.objectContaining({
          message: expect.stringContaining("[REDACTED:email]"),
        }),
      );
      expect(spy).not.toHaveBeenCalledWith(
        "[Error]",
        expect.objectContaining({
          message: expect.stringContaining("dev@example.com"),
        }),
      );
    });
  });

  describe("logger.* generic emitter", () => {
    describe("production", () => {
      beforeEach(() => {
        setNodeEnv("production");
      });

      test("logger.error redacts email in message", () => {
        using spy = spyOn(console, "error").mockImplementation(() => {});
        logger.error("Failed for user@example.com");
        const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
        expect(String(parsed["message"])).not.toContain("user@example.com");
        expect(String(parsed["message"])).toContain("[REDACTED:email]");
      });

      test("logger.warn redacts phone in message", () => {
        using spy = spyOn(console, "warn").mockImplementation(() => {});
        logger.warn("Anomalous call from 03-1234-5678");
        const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
        expect(String(parsed["message"])).not.toContain("03-1234-5678");
        expect(String(parsed["message"])).toContain("[REDACTED:phone]");
      });

      test("logger.info redacts email in message", () => {
        using spy = spyOn(console, "log").mockImplementation(() => {});
        logger.info("Signup: user@example.com");
        const parsed = parseLogRecord(spy.mock.calls[0]?.[0]);
        expect(String(parsed["message"])).not.toContain("user@example.com");
        expect(String(parsed["message"])).toContain("[REDACTED:email]");
      });
    });

    describe("development", () => {
      beforeEach(() => {
        setNodeEnv("development");
      });

      test("logger.error redacts email in dev prefixed output", () => {
        using spy = spyOn(console, "error").mockImplementation(() => {});
        logger.error("Failed for dev@example.com");
        // dev 出力は "[ERROR]" prefix + message 単独引数 or (prefix, message, context)
        // どちらの form でも message から email が消えている
        for (const call of spy.mock.calls) {
          for (const arg of call) {
            expect(String(arg)).not.toContain("dev@example.com");
          }
        }
        expect(spy).toHaveBeenCalledWith(
          "[ERROR]",
          expect.stringContaining("[REDACTED:email]"),
        );
      });

      test("logger.debug redacts email even in dev-only debug channel", () => {
        using spy = spyOn(console, "log").mockImplementation(() => {});
        logger.debug("Debug: user@example.com");
        expect(spy).toHaveBeenCalledWith(
          "[DEBUG]",
          expect.stringContaining("[REDACTED:email]"),
        );
      });
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
    using spy = spyOn(console, "error").mockImplementation(() => {});
    const dbLogger = createErrorLogger({
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
    });

    dbLogger(new Error("DBエラー"));
    expect(spy).toHaveBeenCalled();
  });

  test("追加コンテキストを上書きできる", () => {
    const originalNodeEnv = process.env["NODE_ENV"];
    setNodeEnv("production");
    try {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      const logger = createErrorLogger({
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.LOW,
      });

      logger(new Error("上書きテスト"), {
        severity: ErrorSeverity.HIGH,
        context: { detail: "extra" },
      });

      // ERROR severity → GCP "ERROR"、context が付与される
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"severity":"ERROR"'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"detail":"extra"'),
      );
    } finally {
      setNodeEnv(originalNodeEnv);
    }
  });

  test("デフォルトコンテキストがマージされる", () => {
    const originalNodeEnv = process.env["NODE_ENV"];
    setNodeEnv("production");
    try {
      using spy = spyOn(console, "error").mockImplementation(() => {});
      const logger = createErrorLogger({
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        userId: "default-user",
      });

      logger(new Error("マージテスト"));

      // MEDIUM severity → GCP "WARNING"、EXTERNAL_API カテゴリ、userId が付与される
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"severity":"WARNING"'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"category":"EXTERNAL_API"'),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"default-user"'),
      );
    } finally {
      setNodeEnv(originalNodeEnv);
    }
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
