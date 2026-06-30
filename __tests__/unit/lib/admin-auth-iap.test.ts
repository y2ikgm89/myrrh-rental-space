import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockHeaders = mock(() => new Headers());
const mockRedirect = mock((path: string): never => {
  throw new Error(`redirect:${path}`);
});
const mockFindUnique = mock();
const mockResolveIapIdentity = mock();
const mockBetterAuthGetSession = mock(() => null);

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
    },
  },
}));

mock.module("@/shared/lib/iap/admin-iap-auth", () => ({
  resolveIapIdentity: mockResolveIapIdentity,
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

beforeEach(() => {
  mockHeaders.mockReset();
  mockHeaders.mockImplementation(() => new Headers());
  mockRedirect.mockReset();
  mockRedirect.mockImplementation((path: string): never => {
    throw new Error(`redirect:${path}`);
  });
  mockFindUnique.mockReset();
  mockResolveIapIdentity.mockReset();
  mockBetterAuthGetSession.mockReset();
  mockBetterAuthGetSession.mockImplementation(() => null);
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
