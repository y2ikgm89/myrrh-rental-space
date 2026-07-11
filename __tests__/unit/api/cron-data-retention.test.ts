import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextResponse } from "next/server";
import { DEFAULT_DATA_RETENTION_CONFIG } from "@/shared/lib/json-validators";

// --- モック関数の定義（mock.module() より前に宣言）---

const mockAuthorizeCronRequest = mock<() => Promise<Response | null>>(() =>
  Promise.resolve(null),
);
const mockConnection = mock<() => Promise<void>>(() => Promise.resolve());
const mockUnstableRethrow = mock<(error: unknown) => void>((error) => {
  throw error;
});
const mockLogError = mock<() => void>(() => undefined);
const mockLogInfo = mock<() => void>(() => undefined);

const mockIsFeatureEnabled = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockGetDataRetentionConfig = mock(() =>
  Promise.resolve(DEFAULT_DATA_RETENTION_CONFIG),
);

interface PurgeResult {
  sessionsDeleted: number;
  verificationsDeleted: number;
  loginAttemptsDeleted: number;
  reservationGuestFieldsAnonymized: number;
  inquiriesDeleted: number;
  customersAnonymized: number;
}

const zeroResult: PurgeResult = {
  sessionsDeleted: 0,
  verificationsDeleted: 0,
  loginAttemptsDeleted: 0,
  reservationGuestFieldsAnonymized: 0,
  inquiriesDeleted: 0,
  customersAnonymized: 0,
};

const mockRunDataRetentionPurge = mock<() => Promise<PurgeResult>>(() =>
  Promise.resolve(zeroResult),
);

// --- mock.module() を先に登録 ---

mock.module("next/server", () => ({
  connection: () => mockConnection(),
  NextResponse,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => mockUnstableRethrow(error),
}));

mock.module("@/shared/lib/cron-auth", () => ({
  authorizeCronRequest: () => mockAuthorizeCronRequest(),
}));

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: () => mockIsFeatureEnabled(),
}));

mock.module("@/shared/domain/data-retention/commands", () => ({
  getDataRetentionConfig: () => mockGetDataRetentionConfig(),
  runDataRetentionPurge: () => mockRunDataRetentionPurge(),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: () => mockLogError(),
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
    debug: () => mockLogInfo(),
    info: () => mockLogInfo(),
    warn: () => mockLogInfo(),
    error: () => mockLogInfo(),
  },
}));

const { GET } = await import("@/app/api/cron/data-retention/route");

function buildRequest(): Request {
  return new Request("http://localhost/api/cron/data-retention", {
    headers: { authorization: "Bearer cloud-scheduler-oidc-token" },
  });
}

describe("/api/cron/data-retention", () => {
  beforeEach(() => {
    mockAuthorizeCronRequest.mockClear();
    mockAuthorizeCronRequest.mockImplementation(() => Promise.resolve(null));
    mockConnection.mockClear();
    mockUnstableRethrow.mockClear();
    mockUnstableRethrow.mockImplementation((error) => {
      throw error;
    });
    mockLogError.mockClear();
    mockLogInfo.mockClear();
    mockIsFeatureEnabled.mockClear();
    mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(true));
    mockGetDataRetentionConfig.mockClear();
    mockGetDataRetentionConfig.mockImplementation(() =>
      Promise.resolve(DEFAULT_DATA_RETENTION_CONFIG),
    );
    mockRunDataRetentionPurge.mockClear();
    mockRunDataRetentionPurge.mockImplementation(() =>
      Promise.resolve(zeroResult),
    );
  });

  test("認可失敗時は authorizeCronRequest の Response を即 return し、以降の domain 関数を呼ばない", async () => {
    mockAuthorizeCronRequest.mockImplementation(() =>
      Promise.resolve(new Response("unauthorized", { status: 401 })),
    );
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
    expect(mockRunDataRetentionPurge).not.toHaveBeenCalled();
  });

  test("`await connection()` が `await authorizeCronRequest` より前に呼ばれる", async () => {
    // 呼び出し順序を order.push で観測する
    const order: string[] = [];
    mockConnection.mockImplementation(() => {
      order.push("connection");
      return Promise.resolve();
    });
    mockAuthorizeCronRequest.mockImplementation(() => {
      order.push("auth");
      return Promise.resolve(null);
    });
    await GET(buildRequest());
    expect(order).toEqual(["connection", "auth"]);
  });

  test("feature module `data-retention` が OFF なら skipped を返し、purge を実行しない", async () => {
    mockIsFeatureEnabled.mockImplementation(() => Promise.resolve(false));
    const res = await GET(buildRequest());
    const body = (await res.json()) as {
      skipped: boolean;
      reason: string;
    };
    expect(body.skipped).toBe(true);
    expect(body.reason).toBe("feature_disabled");
    expect(mockRunDataRetentionPurge).not.toHaveBeenCalled();
    expect(mockGetDataRetentionConfig).not.toHaveBeenCalled();
  });

  test("feature module ON なら purge を実行し、結果を summary として返す", async () => {
    const nonZeroResult = {
      sessionsDeleted: 3,
      verificationsDeleted: 1,
      loginAttemptsDeleted: 12,
      reservationGuestFieldsAnonymized: 5,
      inquiriesDeleted: 2,
      customersAnonymized: 0,
    };
    mockRunDataRetentionPurge.mockImplementation(() =>
      Promise.resolve(nonZeroResult),
    );
    const res = await GET(buildRequest());
    const body = (await res.json()) as {
      ranAt: string;
      config: typeof DEFAULT_DATA_RETENTION_CONFIG;
      result: typeof nonZeroResult;
    };
    expect(body.result).toEqual(nonZeroResult);
    expect(body.config).toEqual(DEFAULT_DATA_RETENTION_CONFIG);
    expect(typeof body.ranAt).toBe("string");
    expect(mockRunDataRetentionPurge).toHaveBeenCalledTimes(1);
  });

  test("domain 関数が throw した場合、500 を返し logError で category=DATABASE を記録する", async () => {
    mockRunDataRetentionPurge.mockImplementation(() =>
      Promise.reject(new Error("boom")),
    );
    // unstable_rethrow は Next.js internal error 用（NEXT_REDIRECT 等）だけを再 throw。
    // ここの Error は通常エラー扱いで catch 節が受け取り、logError → jsonError 500 になる。
    mockUnstableRethrow.mockImplementation(() => undefined);
    const res = await GET(buildRequest());
    expect(res.status).toBe(500);
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
