import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockAuditLogFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const mockAuditLogCount = mock<() => Promise<number>>(() => Promise.resolve(0));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    auditLog: {
      findFirst: mockAuditLogFindFirst,
      count: mockAuditLogCount,
    },
  },
}));

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

const mockCreateNotificationCommand = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
const mockHasRecentNotificationOfType = mock<() => Promise<boolean>>(() =>
  Promise.resolve(false),
);

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (
    ...args: Parameters<typeof mockCreateNotificationCommand>
  ) => mockCreateNotificationCommand(...args),
  hasRecentNotificationOfType: (
    ...args: Parameters<typeof mockHasRecentNotificationOfType>
  ) => mockHasRecentNotificationOfType(...args),
}));

mock.module("@/shared/lib/validations/enums/helpers", () => ({
  NOTIFICATION_TYPE: {
    SECURITY_LOGIN_FAILED_SPIKE: "security_login_failed_spike",
  },
  NOTIFICATION_TYPE_LABELS: {
    security_login_failed_spike: "管理者ログイン失敗の急増",
  },
}));

mock.module("@/shared/lib/rate-limit", () => ({
  extractClientIpFromHeaders: () => "203.0.113.1",
}));

const mockLogError = mock(() => undefined);

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
  logError: mockLogError,
  normalizeError: (error: unknown) => error,
}));

const { recordAdminLoginFailed } =
  await import("@/shared/domain/admin-auth/audit");

function makeHeaders(): Headers {
  return new Headers({ "user-agent": "test-agent" });
}

describe("recordAdminLoginFailed のスパイク検知通知", () => {
  beforeEach(() => {
    mockAuditLogFindFirst.mockReset();
    mockAuditLogCount.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockHasRecentNotificationOfType.mockReset();
    mockLogError.mockReset();

    mockAuditLogCount.mockResolvedValue(0);
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
    mockCreateNotificationCommand.mockResolvedValue(undefined);
    mockHasRecentNotificationOfType.mockResolvedValue(false);
  });

  test("常に LOGIN_FAILED の AuditLog を記録する", async () => {
    await recordAdminLoginFailed({
      reason: "user_not_authorized",
      requestHeaders: makeHeaders(),
    });

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        resource: "adminAuth",
        metadata: expect.objectContaining({ reason: "user_not_authorized" }),
      }),
    );
  });

  test("直近15分の失敗件数が閾値未満なら通知しない", async () => {
    mockAuditLogCount.mockResolvedValue(4);

    await recordAdminLoginFailed({
      reason: "iap_assertion_invalid",
      requestHeaders: makeHeaders(),
    });

    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("直近15分の失敗件数が閾値(5件)に達したら通知する", async () => {
    mockAuditLogCount.mockResolvedValue(5);

    await recordAdminLoginFailed({
      reason: "iap_assertion_invalid",
      requestHeaders: makeHeaders(),
    });

    expect(mockCreateNotificationCommand).toHaveBeenCalledTimes(1);
    expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "security_login_failed_spike",
        resourceType: "auditLog",
      }),
    );
  });

  test("直近で既に同type通知済みなら再通知しない（dedupe）", async () => {
    mockAuditLogCount.mockResolvedValue(10);
    mockHasRecentNotificationOfType.mockResolvedValue(true);

    await recordAdminLoginFailed({
      reason: "role_not_allowed",
      requestHeaders: makeHeaders(),
    });

    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("count クエリが例外を投げても recordAdminLoginFailed 自体は成功する（LOW logError で握りつぶす）", async () => {
    mockAuditLogCount.mockRejectedValue(new Error("db down"));

    await recordAdminLoginFailed({
      reason: "iap_assertion_invalid",
      requestHeaders: makeHeaders(),
    });

    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        severity: "LOW",
        context: expect.objectContaining({
          operation: "notifyLoginFailedSpikeIfNeeded",
        }),
      }),
    );
  });
});
