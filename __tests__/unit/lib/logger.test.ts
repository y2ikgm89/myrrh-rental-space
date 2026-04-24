/**
 * 汎用ロガーテスト
 *
 * src/shared/lib/logger.ts のユニットテスト
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { setNodeEnv } from "../../helpers/env";
import { logger } from "@/shared/lib/logger";

const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;
const originalNodeEnv = process.env["NODE_ENV"];

beforeEach(() => {
  console.log = mock(() => {});
  console.info = mock(() => {});
  console.warn = mock(() => {});
  console.error = mock(() => {});
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
  setNodeEnv(originalNodeEnv);
});

// =============================================================================
// 開発環境
// =============================================================================

describe("logger（開発環境）", () => {
  test("debug: console.logで[DEBUG]プレフィックス付き出力", () => {
    setNodeEnv("development");
    logger.debug("デバッグメッセージ");
    expect(console.log).toHaveBeenCalledWith("[DEBUG]", "デバッグメッセージ");
  });

  test("info: console.infoで[INFO]プレフィックス付き出力", () => {
    setNodeEnv("development");
    logger.info("情報メッセージ");
    expect(console.info).toHaveBeenCalledWith("[INFO]", "情報メッセージ");
  });

  test("warn: console.warnで[WARN]プレフィックス付き出力", () => {
    setNodeEnv("development");
    logger.warn("警告メッセージ");
    expect(console.warn).toHaveBeenCalledWith("[WARN]", "警告メッセージ");
  });

  test("error: console.errorで[ERROR]プレフィックス付き出力", () => {
    setNodeEnv("development");
    logger.error("エラーメッセージ");
    expect(console.error).toHaveBeenCalledWith("[ERROR]", "エラーメッセージ");
  });

  test("コンテキスト付きで出力される", () => {
    setNodeEnv("development");
    const ctx = { userId: "u-1", action: "login" };
    logger.info("ログイン", ctx);
    expect(console.info).toHaveBeenCalledWith("[INFO]", "ログイン", ctx);
  });

  test("コンテキストなしでも出力される", () => {
    setNodeEnv("development");
    logger.warn("シンプル");
    const mockFn = console.warn as ReturnType<typeof mock>;
    expect(mockFn.mock.calls[0].length).toBe(2);
  });
});

// =============================================================================
// 本番環境
// =============================================================================

describe("logger（本番環境）", () => {
  test("info: GCP構造化JSONでconsole.logに出力される", () => {
    setNodeEnv("production");
    logger.info("本番情報");
    const mockFn = console.log as ReturnType<typeof mock>;
    expect(mockFn).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(mockFn.mock.calls[0][0]);
    expect(parsed.severity).toBe("INFO");
    expect(parsed.message).toBe("本番情報");
    expect(parsed.timestamp).toBeDefined();
  });

  test("warn: severity WARNINGで出力される", () => {
    setNodeEnv("production");
    logger.warn("本番警告");
    const mockFn = console.warn as ReturnType<typeof mock>;
    const parsed = JSON.parse(mockFn.mock.calls[0][0]);
    expect(parsed.severity).toBe("WARNING");
    expect(parsed.message).toBe("本番警告");
  });

  test("error: severity ERRORで出力される", () => {
    setNodeEnv("production");
    logger.error("本番エラー");
    const mockFn = console.error as ReturnType<typeof mock>;
    const parsed = JSON.parse(mockFn.mock.calls[0][0]);
    expect(parsed.severity).toBe("ERROR");
    expect(parsed.message).toBe("本番エラー");
  });

  test("debug: 本番では出力されない", () => {
    setNodeEnv("production");
    logger.debug("本番デバッグ");
    expect(console.log).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test("コンテキスト付きでJSONに含まれる", () => {
    setNodeEnv("production");
    logger.error("失敗", { userId: "u-1", detail: "timeout" });
    const mockFn = console.error as ReturnType<typeof mock>;
    const parsed = JSON.parse(mockFn.mock.calls[0][0]);
    expect(parsed.context).toEqual({ userId: "u-1", detail: "timeout" });
  });

  test("timestampがISO 8601形式", () => {
    setNodeEnv("production");
    logger.info("時刻テスト");
    const mockFn = console.log as ReturnType<typeof mock>;
    const parsed = JSON.parse(mockFn.mock.calls[0][0]);
    expect(() => new Date(parsed.timestamp)).not.toThrow();
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
