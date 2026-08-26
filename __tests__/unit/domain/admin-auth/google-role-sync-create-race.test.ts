import { beforeEach, describe, expect, mock, test } from "bun:test";
import { uniqueConstraintError } from "../../../helpers/prisma-errors";

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

describe("syncAdminAuthUserFromGoogleGroups create race", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUserCreate.mockReset();
    mockUserUpdate.mockReset();
    mockUserCount.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockCreateNotificationCommand.mockReset();
    mockUserCount.mockResolvedValue(1);
  });

  test("create の email 競合 (P2002) は再取得して更新する", async () => {
    const racedUser = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "VIEWER" as const,
      emailVerified: true,
      dashboardEnabled: false,
    };
    const enabledUser = {
      ...racedUser,
      role: "ADMIN" as const,
      dashboardEnabled: true,
    };

    mockFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(racedUser);
    mockUserCreate.mockRejectedValueOnce(
      uniqueConstraintError("users_email_key", "User"),
    );
    mockUserUpdate.mockResolvedValueOnce(enabledUser);

    const result = await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(mockUserCreate).toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "ADMIN",
          dashboardEnabled: true,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: racedUser.id,
        role: "ADMIN",
      }),
    );
  });
});
