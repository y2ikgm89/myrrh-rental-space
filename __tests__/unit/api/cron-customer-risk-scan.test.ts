import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

// --- モック関数の定義（mock.module() より前）---
const mockDetectSuspiciousCustomers = mock<
  () => Promise<{ customerId: string; reasons: string[] }[]>
>(() => Promise.resolve([]));

const mockApplyRiskFlagsCommand = mock<() => Promise<number>>(() =>
  Promise.resolve(0),
);

const mockCreateNotificationCommand = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

const mockHasRecentNotificationOfType = mock<() => Promise<boolean>>(() =>
  Promise.resolve(false),
);

const mockLogError = mock<() => void>(() => undefined);

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

mock.module("@/shared/domain/customers/risk-detection", () => ({
  detectSuspiciousCustomers: (
    ...args: Parameters<typeof mockDetectSuspiciousCustomers>
  ) => mockDetectSuspiciousCustomers(...args),
  applyRiskFlagsCommand: (
    ...args: Parameters<typeof mockApplyRiskFlagsCommand>
  ) => mockApplyRiskFlagsCommand(...args),
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (
    ...args: Parameters<typeof mockCreateNotificationCommand>
  ) => mockCreateNotificationCommand(...args),
  hasRecentNotificationOfType: (
    ...args: Parameters<typeof mockHasRecentNotificationOfType>
  ) => mockHasRecentNotificationOfType(...args),
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
    info: mock(() => undefined),
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

const { GET } = await import("@/app/api/cron/customer-risk-scan/route");

// --- テスト用ヘルパー ---

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/customer-risk-scan", {
    headers,
  });
}

function makeSchedulerRequest() {
  return makeRequest("Bearer cloud-scheduler-oidc-token");
}

describe("GET /api/cron/customer-risk-scan", () => {
  beforeEach(() => {
    mockDetectSuspiciousCustomers.mockReset();
    mockApplyRiskFlagsCommand.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockHasRecentNotificationOfType.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockDetectSuspiciousCustomers.mockResolvedValue([]);
    mockApplyRiskFlagsCommand.mockResolvedValue(0);
    mockCreateNotificationCommand.mockResolvedValue(undefined);
    mockHasRecentNotificationOfType.mockResolvedValue(false);
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
  });

  test("Cloud Scheduler OIDC 認証失敗 → authorizeCronRequest の返却値をそのまま返す (401)", async () => {
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
      expect.objectContaining({ operation: "customerRiskScan" }),
    );
    expect(mockDetectSuspiciousCustomers).not.toHaveBeenCalled();
  });

  test("直近6日以内に同type通知あり → skip(recent_notification)", async () => {
    mockHasRecentNotificationOfType.mockResolvedValue(true);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: true, reason: "recent_notification" });
    expect(mockDetectSuspiciousCustomers).not.toHaveBeenCalled();
  });

  test("検知0件 → detected:0、通知は送らない", async () => {
    mockDetectSuspiciousCustomers.mockResolvedValue([]);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ detected: 0 });
    expect(mockApplyRiskFlagsCommand).not.toHaveBeenCalled();
    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("検知2件 → applyRiskFlagsCommand + createNotificationCommand が呼ばれる", async () => {
    const detected = [
      { customerId: "cust-1", reasons: ["rapid_booking"] },
      { customerId: "cust-2", reasons: ["frequent_cancellation"] },
    ];
    mockDetectSuspiciousCustomers.mockResolvedValue(detected);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ detected: 2 });
    expect(mockApplyRiskFlagsCommand).toHaveBeenCalledWith(detected);
    expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: "customer_flagged" }),
    );
  });

  test("detectSuspiciousCustomers が例外をスロー → 500 を返す", async () => {
    const dbError = new Error("Database connection failed");
    mockDetectSuspiciousCustomers.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Customer risk scan failed" });
    expect(mockLogError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        context: expect.objectContaining({ operation: "customerRiskScan" }),
      }),
    );
  });
});
