/**
 * User Server Action — action shape & schema 統合テスト
 *
 * **scope**: action 関数の input validation / executeAdminMutationResult への
 * options shape (resource / action / resourceId) / domain command への引数伝搬
 * のみを実 import で検証する。`executeAdminMutationResult` は mock しており
 * **auth / RBAC / cache invalidation / 監査ログは検証しない**。
 * end-to-end な auth + RBAC + cache + audit の検証は
 * `_executeAdminMutationResult-rbac.test.ts` を参照。
 *
 * 対象: deleteUser / updateUserRole
 *
 * conform 系 (createUser / updateUser) は後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { Role } from "@/shared/lib/validations/enums/prisma-types";

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

describe("deleteUser (action shape)", () => {
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

describe("updateUserRole (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateUserRole.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateUserRole("bad", Role.ADMIN);
    expect(isMutationError(r)).toBe(true);
  });

  test("無効な role は validation error", async () => {
    const r = await Reflect.apply(updateUserRole, undefined, [
      VALID_UUID,
      "INVALID",
    ]);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=user, action=manage", async () => {
    await updateUserRole(VALID_UUID, Role.ADMIN);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "user",
        action: "manage",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdateUserRole).toHaveBeenCalledWith(VALID_UUID, Role.ADMIN, {
      id: "admin",
      role: "SUPER_ADMIN",
    });
  });
});
