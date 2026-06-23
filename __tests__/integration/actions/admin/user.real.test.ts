/**
 * User Server Action 実呼出し統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/user.ts の
 * deleteUser / updateUserRole を実 import で呼び出す。
 *
 * conform 系 (createUser / updateUser) は後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockDeleteUser = mock(async () => {});
const mockUpdateUserRole = mock<
  (
    id: string,
    role: string,
    actor: { id: string; role: string },
  ) => Promise<{ oldRole: string; newRole: string }>
>((_id, role) => Promise.resolve({ oldRole: "USER", newRole: role }));

mock.module("@/shared/domain/users/commands", () => ({
  createUser: mock(async () => ({ id: "x" })),
  deleteUser: mockDeleteUser,
  updateUser: mock(async () => {}),
  updateUserRole: mockUpdateUserRole,
}));

mock.module("@/admin/lib/audit", () => ({
  logRoleChange: mock(async () => {}),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};

const mockExecute = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin", role: "SUPER_ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const { deleteUser, updateUserRole } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/user");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("deleteUser (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteUser.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteUser("bad");
    expect(isMutationError(r)).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test("正常系: resource=user, action=delete", async () => {
    await deleteUser(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "user",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteUser).toHaveBeenCalledWith(VALID_UUID, {
      id: "admin",
      role: "SUPER_ADMIN",
    });
  });
});

describe("updateUserRole (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateUserRole.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateUserRole("bad", "ADMIN" as unknown as never);
    expect(isMutationError(r)).toBe(true);
  });

  test("無効な role は validation error", async () => {
    const r = await updateUserRole(VALID_UUID, "INVALID" as unknown as never);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=user, action=manage", async () => {
    await updateUserRole(VALID_UUID, "ADMIN" as unknown as never);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "user",
        action: "manage",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdateUserRole).toHaveBeenCalledWith(VALID_UUID, "ADMIN", {
      id: "admin",
      role: "SUPER_ADMIN",
    });
  });
});
