import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockHeaders = mock(() => new Headers());
const mockRedirect = mock((path: string): never => {
  throw new Error(`redirect:${path}`);
});
const mockFindUnique = mock();
const mockUserCreate = mock();
const mockUserUpdate = mock();
const mockAuditLogFindFirst = mock();
const mockResolveIapIdentity = mock();
const mockBetterAuthGetSession = mock(() => null);
const mockIsGoogleWorkspaceGroupMember = mock();
const mockCreateAuditLogRecord = mock();
const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
  ADMIN_TEST_IAP_EMAIL: undefined,
  CI: undefined,
  ADMIN_APP_URL: undefined,
  BETTER_AUTH_URL: undefined,
};
const originalNextPublicBaseUrl = process.env["NEXT_PUBLIC_BASE_URL"];
const originalNextPublicAppUrl = process.env["NEXT_PUBLIC_APP_URL"];

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
    auditLog: {
      findFirst: mockAuditLogFindFirst,
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
  isLocalhostUrl: (value: string | null | undefined) => {
    if (!value) return false;
    const url = new URL(value);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  },
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
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
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
  mockAuditLogFindFirst.mockReset();
  mockAuditLogFindFirst.mockResolvedValue(null);
  mockResolveIapIdentity.mockReset();
  mockIsGoogleWorkspaceGroupMember.mockReset();
  mockCreateAuditLogRecord.mockReset();
  mockBetterAuthGetSession.mockReset();
  mockBetterAuthGetSession.mockImplementation(() => null);
  mockServerEnv["NODE_ENV"] = "test";
  mockServerEnv["ADMIN_TEST_IAP_EMAIL"] = undefined;
  mockServerEnv["ADMIN_APP_URL"] = undefined;
  mockServerEnv["BETTER_AUTH_URL"] = undefined;
  mockServerEnv["CI"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_SUPER_ADMIN_EMAIL"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_ADMIN_EMAIL"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_EDITOR_EMAIL"] = undefined;
  mockServerEnv["ADMIN_ROLE_GROUP_VIEWER_EMAIL"] = undefined;
  mockServerEnv["E2E_RUNTIME"] = undefined;
  if (originalNextPublicBaseUrl === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_BASE_URL");
  } else {
    process.env["NEXT_PUBLIC_BASE_URL"] = originalNextPublicBaseUrl;
  }
  if (originalNextPublicAppUrl === undefined) {
    Reflect.deleteProperty(process.env, "NEXT_PUBLIC_APP_URL");
  } else {
    process.env["NEXT_PUBLIC_APP_URL"] = originalNextPublicAppUrl;
  }
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
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        action: "LOGIN_SUCCESS",
        resource: "adminAuth",
        resourceId: "user-1",
        metadata: expect.objectContaining({
          provider: "google-iap",
          email: "admin@example.com",
          iapSubject: "subject-1",
          role: "ADMIN",
        }),
      }),
    );
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

  test("CI=true だけでは production の ADMIN_TEST_IAP_EMAIL を IAP 代替 identity として使わない", async () => {
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

    expect(user).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockIsGoogleWorkspaceGroupMember).not.toHaveBeenCalled();
  });

  test("localhost production-mode E2E では ADMIN_TEST_IAP_EMAIL を IAP 代替 identity として使う", async () => {
    mockServerEnv["NODE_ENV"] = "production";
    mockServerEnv["CI"] = undefined;
    mockServerEnv["ADMIN_TEST_IAP_EMAIL"] = "admin@example.com";
    mockServerEnv["E2E_RUNTIME"] = "1";
    mockServerEnv["ADMIN_APP_URL"] = "http://localhost:3000";
    mockServerEnv["BETTER_AUTH_URL"] = "http://localhost:3000";
    process.env["NEXT_PUBLIC_BASE_URL"] = "http://localhost:3000";
    process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
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
  });

  test("real production URL では E2E_RUNTIME=1 でも ADMIN_TEST_IAP_EMAIL を使わない", async () => {
    mockServerEnv["NODE_ENV"] = "production";
    mockServerEnv["ADMIN_TEST_IAP_EMAIL"] = "admin@example.com";
    mockServerEnv["E2E_RUNTIME"] = "1";
    mockServerEnv["ADMIN_APP_URL"] = "https://admin.example.com";
    mockServerEnv["BETTER_AUTH_URL"] = "https://admin.example.com";
    process.env["NEXT_PUBLIC_BASE_URL"] = "https://rental-space.example.com";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://admin.example.com";
    mockResolveIapIdentity.mockResolvedValue(null);

    const user = await getCurrentAdminUser(new Headers());

    expect(user).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test("production-mode E2E の ADMIN_TEST_IAP_EMAIL は Google Group sync を bypass する", async () => {
    enableRoleGroupSyncEnv();
    mockServerEnv["NODE_ENV"] = "production";
    mockServerEnv["CI"] = undefined;
    mockServerEnv["ADMIN_TEST_IAP_EMAIL"] = "admin@example.com";
    mockServerEnv["E2E_RUNTIME"] = "1";
    mockServerEnv["ADMIN_APP_URL"] = "http://localhost:3000";
    mockServerEnv["BETTER_AUTH_URL"] = "http://localhost:3000";
    process.env["NEXT_PUBLIC_BASE_URL"] = "http://localhost:3000";
    process.env["NEXT_PUBLIC_APP_URL"] = "http://localhost:3000";
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
    expect(mockIsGoogleWorkspaceGroupMember).not.toHaveBeenCalled();
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
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        resource: "adminAuth",
        metadata: expect.objectContaining({
          provider: "google-iap",
          email: "missing@example.com",
          iapSubject: "subject-1",
          reason: "user_not_authorized",
        }),
      }),
    );
  });

  test("IAP assertion 検証失敗は LOGIN_FAILED として記録する", async () => {
    mockResolveIapIdentity.mockRejectedValue(new Error("invalid jwt"));

    const user = await getCurrentAdminUser(
      new Headers({ "x-goog-iap-jwt-assertion": "signed.jwt" }),
    );

    expect(user).toBeNull();
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        resource: "adminAuth",
        metadata: expect.objectContaining({
          provider: "google-iap",
          reason: "iap_assertion_invalid",
        }),
      }),
    );
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
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-2",
        action: "LOGIN_FAILED",
        resource: "adminAuth",
        resourceId: "user-2",
        metadata: expect.objectContaining({
          provider: "google-iap",
          email: "customer@example.com",
          iapSubject: "subject-1",
          role: "CUSTOMER",
          reason: "role_not_allowed",
        }),
      }),
    );
  });
});
