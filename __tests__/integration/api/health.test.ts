/**
 * Health API Route Tests
 *
 * /api/health の behavioral テスト。
 * runDatabaseHealthCheck を mock して GET を実呼び出しし、status / JSON body /
 * Cache-Control header / 内部インフラ情報の非露出を検証する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockConnection = mock(() => Promise.resolve());
const mockRunDatabaseHealthCheck = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);
const mockLogError = mock<() => void>(() => {});

mock.module("next/server", () => ({
  connection: mockConnection,
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

mock.module("@/shared/domain/system/queries", () => ({
  runDatabaseHealthCheck: mockRunDatabaseHealthCheck,
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
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

mock.module("next/navigation", () => ({
  unstable_rethrow: mock(() => {}),
}));

const { GET } = await import("@/app/api/health/route");

describe("GET /api/health", () => {
  beforeEach(() => {
    mockConnection.mockClear();
    mockRunDatabaseHealthCheck.mockReset();
    mockLogError.mockReset();
  });

  describe("正常系", () => {
    test("DB 疎通成功時は 200 + status: healthy を返す", async () => {
      mockRunDatabaseHealthCheck.mockResolvedValueOnce(undefined);

      const response = await GET();

      expect(mockConnection).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("healthy");
      expect(typeof body.timestamp).toBe("string");
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("no-store の Cache-Control ヘッダーを返す", async () => {
      mockRunDatabaseHealthCheck.mockResolvedValueOnce(undefined);

      const response = await GET();

      expect(response.headers.get("Cache-Control")).toBe(
        "no-cache, no-store, must-revalidate",
      );
    });

    test("内部インフラ情報を露出せず status + timestamp のみ返す", async () => {
      mockRunDatabaseHealthCheck.mockResolvedValueOnce(undefined);

      const response = await GET();
      const body = await response.json();

      expect(Object.keys(body).sort()).toEqual(["status", "timestamp"]);
    });
  });

  describe("異常系", () => {
    test("DB 疎通失敗時は 503 + status: unhealthy を返す", async () => {
      mockRunDatabaseHealthCheck.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      const response = await GET();

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.status).toBe("unhealthy");
    });

    test("DB 疎通失敗時は logError で記録する", async () => {
      mockRunDatabaseHealthCheck.mockRejectedValueOnce(
        new Error("connection refused"),
      );

      await GET();

      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    test("失敗時も DB 接続詳細（接続文字列等）を body に露出しない", async () => {
      mockRunDatabaseHealthCheck.mockRejectedValueOnce(
        new Error("postgresql://user:pw@db-host:5432/app connection refused"),
      );

      const response = await GET();
      const body = await response.json();

      expect(Object.keys(body).sort()).toEqual(["status", "timestamp"]);
      expect(JSON.stringify(body)).not.toContain("postgresql");
    });
  });
});
