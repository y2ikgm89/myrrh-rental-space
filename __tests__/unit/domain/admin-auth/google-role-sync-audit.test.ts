import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockFindUnique = mock();
const mockUserCreate = mock();
const mockUserUpdate = mock();
const mockUserCount = mock();
const mockCreateAuditLogRecord = mock();
const mockCreateNotificationCommand = mock();

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      count: mockUserCount,
    },
  },
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mockCreateNotificationCommand,
}));

mock.module("@/shared/lib/validations/enums/helpers", () => ({
  NOTIFICATION_TYPE: { SECURITY_ROLE_CHANGE: "security_role_change" },
  NOTIFICATION_TYPE_LABELS: { security_role_change: "管理者ロール変更" },
}));

mock.module("@/shared/lib/google-workspace/cloud-identity-groups", () => ({
  isGoogleWorkspaceGroupMember: async ({
    groupEmail,
  }: {
    groupEmail: string;
    memberEmail: string;
  }) => groupEmail === "admins@example.com",
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL: "super-admins@example.com",
    ADMIN_ROLE_GROUP_ADMIN_EMAIL: "admins@example.com",
    ADMIN_ROLE_GROUP_EDITOR_EMAIL: "editors@example.com",
    ADMIN_ROLE_GROUP_VIEWER_EMAIL: "viewers@example.com",
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    DATABASE: "DATABASE",
    AUTHORIZATION: "AUTHORIZATION",
  },
  ErrorSeverity: { HIGH: "HIGH", LOW: "LOW" },
  logError: mock(),
  normalizeError: (error: unknown) => error,
}));

const { syncAdminAuthUserFromGoogleGroups } =
  await import("@/shared/domain/admin-auth/google-role-sync");

describe("syncAdminAuthUserFromGoogleGroups audit logging", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUserCreate.mockReset();
    mockUserUpdate.mockReset();
    mockUserCount.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockCreateNotificationCommand.mockResolvedValue(undefined);
    mockUserCount.mockResolvedValue(1);
  });

  test("Google グループ同期で管理ユーザーを新規作成したら監査ログを残す（通知は送らない）", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
      dashboardEnabled: true,
    });

    await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        resource: "user",
        resourceId: "11111111-1111-4111-8111-111111111111",
        newValue: {
          role: "ADMIN",
          emailVerified: true,
          dashboardEnabled: true,
        },
        metadata: expect.objectContaining({
          source: "google-workspace-role-sync",
          targetEmail: "admin@example.com",
        }),
      }),
    );
    // 新規作成は「ロール変更」ではないため通知対象外
    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("Google グループ同期でロールが変わったら ROLE_CHANGE を残す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "VIEWER",
      emailVerified: true,
      dashboardEnabled: true,
    });
    mockUserUpdate.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
      dashboardEnabled: true,
    });

    await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ROLE_CHANGE",
        resource: "user",
        resourceId: "22222222-2222-4222-8222-222222222222",
        oldValue: { role: "VIEWER", dashboardEnabled: true },
        newValue: {
          role: "ADMIN",
          emailVerified: true,
          dashboardEnabled: true,
        },
        metadata: expect.objectContaining({
          source: "google-workspace-role-sync",
          targetEmail: "admin@example.com",
        }),
      }),
    );
    expect(mockCreateNotificationCommand).toHaveBeenCalledTimes(1);
    expect(mockCreateNotificationCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "security_role_change",
        resourceType: "user",
        message: expect.stringContaining("VIEWER → ADMIN"),
      }),
    );
  });

  test("ロールが変わらない同期（emailVerified等の更新のみ）では通知しない", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: false,
      dashboardEnabled: true,
    });
    mockUserUpdate.mockResolvedValueOnce({
      id: "33333333-3333-4333-8333-333333333333",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
      dashboardEnabled: true,
    });

    await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "UPDATE" }),
    );
    expect(mockCreateNotificationCommand).not.toHaveBeenCalled();
  });

  test("通知の書込が失敗しても syncAdminAuthUserFromGoogleGroups 自体は成功する", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "44444444-4444-4444-8444-444444444444",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "VIEWER",
      emailVerified: true,
      dashboardEnabled: true,
    });
    const updated = {
      id: "44444444-4444-4444-8444-444444444444",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
      dashboardEnabled: true,
    } as const;
    mockUserUpdate.mockResolvedValueOnce(updated);
    mockCreateNotificationCommand.mockRejectedValueOnce(
      new Error("notification db error"),
    );

    const result = await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(result).toEqual({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      image: updated.image,
      role: updated.role,
      emailVerified: updated.emailVerified,
    });
  });
});
