import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockServerEnv: Record<string, string | undefined> = {
  INITIAL_ADMIN_EMAIL: "owner@example.com",
  INITIAL_ADMIN_NAME: "Owner",
};

const mockUserCount = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockUserFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockUserCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "created-user-id" }),
);
const mockUserUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "existing-user-id" }),
);
const mockAccountCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "account-id" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: {
      count: mockUserCount,
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
    },
    account: {
      create: mockAccountCreate,
    },
  },
}));

import { bootstrapInitialAdmin } from "@/shared/lib/bootstrap/initial-admin";

describe("bootstrapInitialAdmin", () => {
  beforeEach(() => {
    mockServerEnv["INITIAL_ADMIN_EMAIL"] = "owner@example.com";
    mockServerEnv["INITIAL_ADMIN_NAME"] = "Owner";

    mockUserCount.mockReset();
    mockUserFindUnique.mockReset();
    mockUserCreate.mockReset();
    mockUserUpdate.mockReset();
    mockAccountCreate.mockReset();

    mockUserCount.mockResolvedValue(0);
    mockUserFindUnique.mockResolvedValue(null);
    mockUserCreate.mockResolvedValue({ id: "created-user-id" });
    mockUserUpdate.mockResolvedValue({ id: "existing-user-id" });
    mockAccountCreate.mockResolvedValue({ id: "account-id" });
  });

  test("creates initial SUPER_ADMIN without credential account when none exists", async () => {
    await bootstrapInitialAdmin();

    expect(mockUserCreate).toHaveBeenCalledWith({
      data: {
        email: "owner@example.com",
        name: "Owner",
        role: "SUPER_ADMIN",
        emailVerified: true,
      },
    });
    expect(mockAccountCreate).not.toHaveBeenCalled();
  });

  test("updates existing email to initial SUPER_ADMIN when no SUPER_ADMIN exists", async () => {
    mockUserFindUnique.mockResolvedValueOnce({ id: "existing-user-id" });

    await bootstrapInitialAdmin();

    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: "existing-user-id" },
      data: {
        name: "Owner",
        role: "SUPER_ADMIN",
        emailVerified: true,
      },
    });
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockAccountCreate).not.toHaveBeenCalled();
  });

  test("skips when a SUPER_ADMIN already exists", async () => {
    mockUserCount.mockResolvedValueOnce(1);

    await bootstrapInitialAdmin();

    expect(mockUserFindUnique).not.toHaveBeenCalled();
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  test("skips when INITIAL_ADMIN_EMAIL is not configured", async () => {
    mockServerEnv["INITIAL_ADMIN_EMAIL"] = undefined;

    await bootstrapInitialAdmin();

    expect(mockUserCount).not.toHaveBeenCalled();
    expect(mockUserCreate).not.toHaveBeenCalled();
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });
});
