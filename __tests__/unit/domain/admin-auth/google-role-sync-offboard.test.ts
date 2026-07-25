import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockFindUnique = mock();
const mockUserCreate = mock();
const mockUserUpdate = mock();
const mockUserCount = mock();
const mockCreateAuditLogRecord = mock();
const mockCreateNotificationCommand = mock();
const mockLogError = mock();

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
  isGoogleWorkspaceGroupMember: async () => false,
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
  logError: mockLogError,
  normalizeError: (error: unknown) => error,
}));

const { syncAdminAuthUserFromGoogleGroups } =
  await import("@/shared/domain/admin-auth/google-role-sync");

describe("syncAdminAuthUserFromGoogleGroups offboarding", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUserCreate.mockReset();
    mockUserUpdate.mockReset();
    mockUserCount.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockLogError.mockReset();
  });

  test("グループ未所属の既存スタッフは dashboardEnabled=false にしてログイン不可", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "editor@example.com",
      name: "editor",
      image: null,
      role: "EDITOR",
      emailVerified: true,
      dashboardEnabled: true,
    });
    mockUserUpdate.mockResolvedValueOnce({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "editor@example.com",
      name: "editor",
      image: null,
      role: "EDITOR",
      emailVerified: true,
      dashboardEnabled: false,
    });

    const result =
      await syncAdminAuthUserFromGoogleGroups("editor@example.com");

    expect(result).toBeNull();
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { dashboardEnabled: false },
      }),
    );
  });

  test("最後の ADMIN は revoke せず状態を維持する", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
      dashboardEnabled: true,
    });
    mockUserCount.mockResolvedValueOnce(0);

    const result = await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(result).toEqual(
      expect.objectContaining({
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        role: "ADMIN",
      }),
    );
    expect(mockUserUpdate).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
  });
});
