import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockFindUnique = mock();
const mockUserCreate = mock();
const mockUserUpdate = mock();
const mockCreateAuditLogRecord = mock();

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
  },
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
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
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API", DATABASE: "DATABASE" },
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
    mockCreateAuditLogRecord.mockReset();
  });

  test("Google グループ同期で管理ユーザーを新規作成したら監査ログを残す", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockUserCreate.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });

    await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        resource: "user",
        resourceId: "11111111-1111-4111-8111-111111111111",
        newValue: { role: "ADMIN", emailVerified: true },
        metadata: expect.objectContaining({
          source: "google-workspace-role-sync",
          targetEmail: "admin@example.com",
        }),
      }),
    );
  });

  test("Google グループ同期でロールが変わったら ROLE_CHANGE を残す", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "VIEWER",
      emailVerified: true,
    });
    mockUserUpdate.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.com",
      name: "admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });

    await syncAdminAuthUserFromGoogleGroups("admin@example.com");

    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ROLE_CHANGE",
        resource: "user",
        resourceId: "22222222-2222-4222-8222-222222222222",
        oldValue: { role: "VIEWER" },
        newValue: { role: "ADMIN", emailVerified: true },
        metadata: expect.objectContaining({
          source: "google-workspace-role-sync",
          targetEmail: "admin@example.com",
        }),
      }),
    );
  });
});
