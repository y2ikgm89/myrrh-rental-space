import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

// --- モック関数の定義（mock.module() より前）---
type IntegrityResult = {
  ok: boolean;
  checkedCount: number;
  latestSequence: string | null;
  latestHash: string | null;
  checkedAt: string;
  failures: { sequence: string; id: string; reason: string }[];
};

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

const mockVerifyAuditLogIntegrity = mock<() => Promise<IntegrityResult>>(() =>
  Promise.resolve({
    ok: true,
    checkedCount: 0,
    latestSequence: null,
    latestHash: null,
    checkedAt: "2026-07-20T00:00:00.000Z",
    failures: [],
  }),
);

const mockLogError = mock<() => void>(() => undefined);
const mockLoggerInfo = mock<() => void>(() => undefined);

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);

const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

// --- mock.module() は await import() より前 ---

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/domain/audit-log/integrity", () => ({
  verifyAuditLogIntegrity: (
    ...args: Parameters<typeof mockVerifyAuditLogIntegrity>
  ) => mockVerifyAuditLogIntegrity(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: Parameters<typeof mockLogError>) => mockLogError(...args),
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

mock.module("@/shared/lib/errors/logger-core", () => ({
  logger: {
    info: (...args: Parameters<typeof mockLoggerInfo>) =>
      mockLoggerInfo(...args),
    warn: mock(() => undefined),
    error: mock(() => undefined),
  },
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (
    ...args: Parameters<typeof mockAuthorizeCronRequest>
  ) => mockAuthorizeCronRequest(...args),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

const { GET } = await import("@/app/api/cron/audit-log-integrity/route");

// --- テスト用ヘルパー ---

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/audit-log-integrity", {
    headers,
  });
}

function makeSchedulerRequest() {
  return makeRequest("Bearer cloud-scheduler-oidc-token");
}

describe("GET /api/cron/audit-log-integrity", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockReset();
    mockVerifyAuditLogIntegrity.mockReset();
    mockLogError.mockReset();
    mockLoggerInfo.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
    mockVerifyAuditLogIntegrity.mockResolvedValue({
      ok: true,
      checkedCount: 0,
      latestSequence: null,
      latestHash: null,
      checkedAt: "2026-07-20T00:00:00.000Z",
      failures: [],
    });
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("Cloud Scheduler OIDC 認証失敗 → authorizeCronRequest の返却値をそのまま返す (401)、検証は実行しない", async () => {
    const authErrorResponse = NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
    mockAuthorizeCronRequest.mockResolvedValue(authErrorResponse);

    const response = await GET(makeRequest("Bearer invalid-oidc-token"));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: "Unauthorized" });
    expect(mockAuthorizeCronRequest).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "auditLogIntegrityCron" }),
    );
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockVerifyAuditLogIntegrity).not.toHaveBeenCalled();
  });

  test("認証成功時、検証前に INTEGRITY_CHECK の AuditLog を先に記録する", async () => {
    await GET(makeSchedulerRequest());

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "INTEGRITY_CHECK",
        resource: "auditLog",
        metadata: expect.objectContaining({
          operation: "verifyAuditLogIntegrity",
          trigger: "cron",
        }),
      }),
    );
  });

  test("整合性OK → 200、result をそのまま要約して返し logger.info のみ呼ばれる（CRITICAL logError なし）", async () => {
    mockVerifyAuditLogIntegrity.mockResolvedValue({
      ok: true,
      checkedCount: 42,
      latestSequence: "42",
      latestHash: "abc123",
      checkedAt: "2026-07-20T04:30:00.000Z",
      failures: [],
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      checkedCount: 42,
      failureCount: 0,
      checkedAt: "2026-07-20T04:30:00.000Z",
    });
    expect(mockLoggerInfo).toHaveBeenCalledTimes(1);
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("改ざん検出時 → 200 のまま（cron のリトライでは解消しないため）だが CRITICAL で logError する", async () => {
    const failure = {
      sequence: "17",
      id: "row-17",
      reason: "ENTRY_HASH_MISMATCH",
    };
    mockVerifyAuditLogIntegrity.mockResolvedValue({
      ok: false,
      checkedCount: 42,
      latestSequence: "42",
      latestHash: "abc123",
      checkedAt: "2026-07-20T04:30:00.000Z",
      failures: [failure],
    });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      checkedCount: 42,
      failureCount: 1,
      checkedAt: "2026-07-20T04:30:00.000Z",
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        severity: "CRITICAL",
        context: expect.objectContaining({
          operation: "auditLogIntegrityCron",
          checkedCount: 42,
          failureCount: 1,
          firstFailure: failure,
        }),
      }),
    );
    expect(mockLoggerInfo).not.toHaveBeenCalled();
  });

  test("verifyAuditLogIntegrity が例外をスロー → 500 を返す", async () => {
    const dbError = new Error("Database connection failed");
    mockVerifyAuditLogIntegrity.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Audit log integrity check failed" });
    expect(mockLogError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        severity: "HIGH",
        context: expect.objectContaining({
          operation: "auditLogIntegrityCron",
        }),
      }),
    );
  });
});
