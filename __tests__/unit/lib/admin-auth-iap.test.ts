import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockHeaders = mock(() => new Headers());
const mockRedirect = mock((path: string): never => {
  throw new Error(`redirect:${path}`);
});
const mockFindUnique = mock();
const mockUserCreate = mock();
const mockUserUpdate = mock();
const mockResolveIapIdentity = mock();
const mockBetterAuthGetSession = mock(() => null);
const mockIsGoogleWorkspaceGroupMember = mock();
const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
  ADMIN_TEST_IAP_EMAIL: undefined,
  CI: undefined,
};

mock.module("next/headers", () => ({
  headers: mockHeaders,
}));

mock.module("next/navigation", () => ({
  redirect: mockRedirect,
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
  },
}));

mock.module("@/shared/lib/google-workspace/cloud-identity-groups", () => ({
  isGoogleWorkspaceGroupMember: mockIsGoogleWorkspaceGroupMember,
}));

mock.module("@/shared/lib/iap/admin-iap-auth", () => ({
  resolveIapIdentity: mockResolveIapIdentity,
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

mock.module("better-auth", () => ({
  betterAuth: () => ({
    api: {
      getSession: mockBetterAuthGetSession,
    },
  }),
}));

mock.module("better-auth/api", () => ({
  APIError: class APIError extends Error {},
  createAuthMiddleware: (handler: unknown) => handler,
}));

mock.module("better-auth/next-js", () => ({
  nextCookies: () => ({}),
}));

mock.module("@/shared/db/better-auth-adapter", () => ({
  createBetterAuthDatabaseAdapter: () => ({}),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(),
}));

mock.module("@/shared/lib/action-helpers", () => ({
  validateTurnstile: mock(() => Promise.resolve({ success: true })),
}));

const { getAdminSession, getCurrentAdminUser, verifyAdminSession } =
  await import("@/shared/lib/admin-auth");

function enableRoleGroupSyncEnv(): void {
  mockServerEnv["ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL"] =
    "myrrh-super-admins@example.com";
  mockServerEnv["ADMIN_ROLE_GROUP_ADMIN_EMAIL"] = "myrrh-admins@example.com";
  mockServerEnv["ADMIN_ROLE_GROUP_EDITOR_EMAIL"] = "myrrh-editors@example.com";
  mockServerEnv["ADMIN_ROLE_GROUP_VIEWER_EMAIL"] = "myrrh-viewers@example.com";
}

beforeEach(() => {
  mockHeaders.mockReset();
  mockHeaders.mockImplementation(() => new Headers());
  mockRedirect.mockReset();
  mockRedirect.mockImplementation((path: string): never => {
    throw new Error(`redirect:${path}`);
  });
  mockFindUnique.mockReset();
  mockUserCreate.mockReset();
  mockUserUpdate.mockReset();
  mockResolveIapIdentity.mockReset();
  mockIsGoogleWorkspaceGroupMember.mockReset();
  mockBetterAuthGetSession.mockReset();
  mockBetterAuthGetSession.mockImplementation(() => null);
  mockServerEnv["NODE_ENV"] = "test";
  mockServerEnv["ADMIN_TEST_IAP_EMAIL"] = undefined;
  mockServerEnv["CI"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_ADMIN_EMAIL"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_EDITOR_EMAIL"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_VIEWER_EMAIL"] = undefined;
});

describe("admin auth IAP boundary", () => {
  test("getCurrentAdminUser は IAP メールに一致する dashboard user を返す", async () => {
    mockResolveIapIdentity.mockResolvedValue({
      email: "admin@example.com",
      subject: "subject-1",
    });
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });

    const user = await getCurrentAdminUser(new Headers());

    expect(user).toEqual({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        emailVerified: true,
      },
    });
  });

  test("getAdminSession は IAP user を session shape で返す", async () => {
    mockResolveIapIdentity.mockResolvedValue({
      email: "admin@example.com",
      subject: "subject-1",
    });
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });

    await expect(getAdminSession(new Headers())).resolves.toEqual({
      user: {
        id: "user-1",
        email: "admin@example.com",
        name: "Admin",
        image: null,
        role: "ADMIN",
        emailVerified: true,
      },
    });
  });

  test("CI の production start では ADMIN_TEST_IAP_EMAIL を IAP 代替 identity として使う", async () => {
    mockServerEnv["NODE_ENV"] = "production";
    mockServerEnv["CI"] = "true";
    mockServerEnv["ADMIN_TEST_IAP_EMAIL"] = "admin@example.com";
    enableRoleGroupSyncEnv();
    mockResolveIapIdentity.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
      name: "Admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });

    const user = await getCurrentAdminUser(new Headers());

    expect(user?.email).toBe("admin@example.com");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { email: "admin@example.com" },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        emailVerified: true,
      },
    });
    expect(mockIsGoogleWorkspaceGroupMember).not.toHaveBeenCalled();
  });

  test("通常 production では ADMIN_TEST_IAP_EMAIL を無視する", async () => {
    mockServerEnv["NODE_ENV"] = "production";
    mockServerEnv["CI"] = undefined;
    mockServerEnv["ADMIN_TEST_IAP_EMAIL"] = "admin@example.com";
    mockResolveIapIdentity.mockResolvedValue(null);

    const user = await getCurrentAdminUser(new Headers());

    expect(user).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test("verifyAdminSession は未登録 IAP user を access-denied に送る", async () => {
    mockResolveIapIdentity.mockResolvedValue({
      email: "missing@example.com",
      subject: "subject-1",
    });
    mockFindUnique.mockResolvedValue(null);

    await expect(verifyAdminSession(new Headers())).rejects.toThrow(
      "redirect:/admin/access-denied",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/admin/access-denied");
  });

  test("Google Group 同期が有効な場合は未登録 IAP user を自動作成する", async () => {
    enableRoleGroupSyncEnv();
    mockResolveIapIdentity.mockResolvedValue({
      email: "new-admin@example.com",
      subject: "subject-1",
    });
    mockIsGoogleWorkspaceGroupMember.mockImplementation(
      ({ groupEmail }: { groupEmail: string }) =>
        Promise.resolve(groupEmail === "myrrh-admins@example.com"),
    );
    mockFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({
      id: "user-3",
      email: "new-admin@example.com",
      name: "new-admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });

    const user = await getCurrentAdminUser(new Headers());

    expect(user).toEqual({
      id: "user-3",
      email: "new-admin@example.com",
      name: "new-admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });
    expect(mockUserCreate).toHaveBeenCalledWith({
      data: {
        email: "new-admin@example.com",
        name: "new-admin",
        role: "ADMIN",
        emailVerified: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        emailVerified: true,
      },
    });
  });

  test("Google Group の所属ロールが変わると既存 staff role を同期する", async () => {
    enableRoleGroupSyncEnv();
    mockResolveIapIdentity.mockResolvedValue({
      email: "staff@example.com",
      subject: "subject-1",
    });
    mockIsGoogleWorkspaceGroupMember.mockImplementation(
      ({ groupEmail }: { groupEmail: string }) =>
        Promise.resolve(groupEmail === "myrrh-editors@example.com"),
    );
    mockFindUnique.mockResolvedValue({
      id: "user-4",
      email: "staff@example.com",
      name: "Staff",
      image: null,
      role: "ADMIN",
      emailVerified: true,
    });
    mockUserUpdate.mockResolvedValue({
      id: "user-4",
      email: "staff@example.com",
      name: "Staff",
      image: null,
      role: "EDITOR",
      emailVerified: true,
    });

    const user = await getCurrentAdminUser(new Headers());

    expect(user?.role).toBe("EDITOR");
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "user-4" },
      data: {
        role: "EDITOR",
        emailVerified: true,
        name: "Staff",
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        emailVerified: true,
      },
    });
  });

  test("Google Role Group に複数所属している IAP user は拒否する", async () => {
    enableRoleGroupSyncEnv();
    mockResolveIapIdentity.mockResolvedValue({
      email: "conflicting@example.com",
      subject: "subject-1",
    });
    mockIsGoogleWorkspaceGroupMember.mockImplementation(
      ({ groupEmail }: { groupEmail: string }) =>
        Promise.resolve(
          groupEmail === "myrrh-admins@example.com" ||
            groupEmail === "myrrh-editors@example.com",
        ),
    );

    await expect(verifyAdminSession(new Headers())).rejects.toThrow(
      "redirect:/admin/access-denied",
    );
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("verifyAdminSession は dashboard role 以外を access-denied に送る", async () => {
    mockResolveIapIdentity.mockResolvedValue({
      email: "customer@example.com",
      subject: "subject-1",
    });
    mockFindUnique.mockResolvedValue({
      id: "user-2",
      email: "customer@example.com",
      name: "Customer",
      image: null,
      role: "CUSTOMER",
      emailVerified: true,
    });

    await expect(verifyAdminSession(new Headers())).rejects.toThrow(
      "redirect:/admin/access-denied",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/admin/access-denied");
  });
});
