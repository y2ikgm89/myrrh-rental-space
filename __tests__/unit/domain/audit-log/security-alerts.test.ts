import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockAuditLogCount = mock<() => Promise<number>>(() => Promise.resolve(0));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    auditLog: {
      count: mockAuditLogCount,
    },
  },
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
    SECURITY_PERMISSION_DENIED: "security_permission_denied",
  },
  NOTIFICATION_TYPE_LABELS: {
    security_permission_denied: "権限エラーの多発",
  },
}));

const mockLogError = mock(() => undefined);

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
  logError: mockLogError,
  normalizeError: (error: unknown) => error,
}));

const { notifyPermissionDeniedSpikeIfNeeded } =
  await import("@/shared/domain/audit-log/security-alerts");

describe("notifyPermissionDeniedSpikeIfNeeded", () => {
  beforeEach(() => {
    mockAuditLogCount.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockHasRecentNotificationOfType.mockReset();
    mockLogError.mockReset();

    mockAuditLogCount.mockResolvedValue(0);
    mockCreateNotificationCommand.mockResolvedValue(undefined);
    mockHasRecentNotificationOfType.mockResolvedValue(false);
  });

  test("閾値未満なら通知しない", async () => {
    mockAuditLogCount.mockResolvedValue(4);

    await notifyPermissionDeniedSpikeIfNeeded("user-1");

    expect(mockAuditLogCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user-1",
          action: "PERMISSION_DENIED",
        }),
      }),
    );
    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("閾値(5件)に達したら対象ユーザーIDを resourceId にして通知する", async () => {
    mockAuditLogCount.mockResolvedValue(5);

    await notifyPermissionDeniedSpikeIfNeeded("user-2");

    expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "security_permission_denied",
        resourceType: "user",
        resourceId: "user-2",
      }),
    );
  });

  test("直近で既に通知済みなら再通知しない（dedupe）", async () => {
    mockAuditLogCount.mockResolvedValue(9);
    mockHasRecentNotificationOfType.mockResolvedValue(true);

    await notifyPermissionDeniedSpikeIfNeeded("user-3");

    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("count が例外を投げても呼び出し元に伝播しない（LOW logError で握りつぶす）", async () => {
    mockAuditLogCount.mockRejectedValue(new Error("db down"));

    await notifyPermissionDeniedSpikeIfNeeded("user-4");

    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        severity: "LOW",
        context: expect.objectContaining({
          operation: "notifyPermissionDeniedSpikeIfNeeded",
          userId: "user-4",
        }),
      }),
    );
  });
});
