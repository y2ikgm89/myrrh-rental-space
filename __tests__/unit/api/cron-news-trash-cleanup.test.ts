import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";

const mockPermanentlyDeleteExpiredNewsTrash = mock<
  (retentionDays: number) => Promise<{ deleted: number }>
>(() => Promise.resolve({ deleted: 0 }));

const mockLogError = mock<() => void>(() => undefined);

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);

const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());

const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});

const mockIsFeatureEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/domain/news/trash-commands", () => ({
  permanentlyDeleteExpiredNewsTrash: (
    ...args: Parameters<typeof mockPermanentlyDeleteExpiredNewsTrash>
  ) => mockPermanentlyDeleteExpiredNewsTrash(...args),
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
  },
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: (
    ...args: Parameters<typeof mockAuthorizeCronRequest>
  ) => mockAuthorizeCronRequest(...args),
}));

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: (...args: Parameters<typeof mockIsFeatureEnabled>) =>
    mockIsFeatureEnabled(...args),
}));

mock.module("@/shared/lib/route-responses", () => ({
  jsonError: (error: string, status = 400) =>
    NextResponse.json({ error }, { status }),
  jsonSuccess: <T>(data: T, status = 200) =>
    NextResponse.json(data, { status }),
}));

const { GET } = await import("@/app/api/cron/news-trash-cleanup/route");

function makeRequest(authHeader?: string) {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/news-trash-cleanup", {
    headers,
  });
}

function makeSchedulerRequest() {
  return makeRequest("Bearer cloud-scheduler-oidc-token");
}

describe("GET /api/cron/news-trash-cleanup", () => {
  beforeEach(() => {
    mockPermanentlyDeleteExpiredNewsTrash.mockReset();
    mockLogError.mockReset();
    mockAuthorizeCronRequest.mockReset();
    mockConnection.mockReset();
    mockUnstableRethrow.mockReset();
    mockIsFeatureEnabled.mockReset();

    mockConnection.mockResolvedValue(undefined);
    mockAuthorizeCronRequest.mockResolvedValue(null);
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockPermanentlyDeleteExpiredNewsTrash.mockResolvedValue({ deleted: 0 });
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
      expect.objectContaining({ operation: "newsTrashCleanup" }),
    );
    expect(mockPermanentlyDeleteExpiredNewsTrash).not.toHaveBeenCalled();
  });

  test("news feature module OFF → skip して DB を触らない", async () => {
    mockIsFeatureEnabled.mockResolvedValue(false);

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ skipped: true, reason: "feature_disabled" });
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith("news");
    expect(mockPermanentlyDeleteExpiredNewsTrash).not.toHaveBeenCalled();
  });

  test("対象なし → deleted=0 で正常終了", async () => {
    mockPermanentlyDeleteExpiredNewsTrash.mockResolvedValue({ deleted: 0 });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ deleted: 0, retentionDays: 30 });
    expect(mockPermanentlyDeleteExpiredNewsTrash).toHaveBeenCalledWith(30);
  });

  test("対象あり → deleted 件数を返す", async () => {
    mockPermanentlyDeleteExpiredNewsTrash.mockResolvedValue({ deleted: 3 });

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ deleted: 3, retentionDays: 30 });
  });

  test("permanentlyDeleteExpiredNewsTrash が例外をスロー → 500 + logError", async () => {
    const dbError = new Error("Database connection failed");
    mockPermanentlyDeleteExpiredNewsTrash.mockRejectedValue(dbError);
    mockUnstableRethrow.mockImplementation(() => {});

    const response = await GET(makeSchedulerRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Cleanup failed" });
    expect(mockLogError).toHaveBeenCalledWith(
      dbError,
      expect.objectContaining({
        context: expect.objectContaining({
          operation: "newsTrashCleanup",
        }),
      }),
    );
  });
});
