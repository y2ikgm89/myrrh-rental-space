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
 * 対象: deleteUser / resendStaffAccessGuide
 *
 * conform 系 (createUser / updateUser) は後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

const mockDeleteUser = mock(async () => {});
const mockGetUser = mock(async () => ({
  id: VALID_UUID,
  email: "staff@example.com",
  name: "Staff User",
  role: "EDITOR",
  emailVerified: false,
  image: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  _count: { reservations: 0, posts: 0 },
}));
const mockSendStaffAccessGuideEmail = mock(async () => ({
  ok: true,
  messageId: "message-1",
}));

mock.module("@/shared/domain/users/commands", () => ({
  createUser: mock(async () => ({ id: "x" })),
  deleteUser: mockDeleteUser,
  updateUser: mock(async () => {}),
}));

mock.module("@/shared/domain/users/queries", () => ({
  getUser: mockGetUser,
}));

mock.module("@/shared/lib/email/system-emails", () => ({
  sendStaffAccessGuideEmail: mockSendStaffAccessGuideEmail,
}));

mock.module("@/shared/lib/admin-urls", () => ({
  getAdminUrl: mock(() => "https://admin.example.com/admin"),
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

const { deleteUser, resendStaffAccessGuide } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/user");
const { isMutationError } = await import("@/shared/lib/mutation-result");

describe("deleteUser (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteUser.mockClear();
    mockGetUser.mockClear();
    mockSendStaffAccessGuideEmail.mockClear();
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

describe("resendStaffAccessGuide (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockGetUser.mockClear();
    mockSendStaffAccessGuideEmail.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await resendStaffAccessGuide("bad");
    expect(isMutationError(r)).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockSendStaffAccessGuideEmail).not.toHaveBeenCalled();
  });

  test("正常系: resource=user, action=create で案内メールを送信する", async () => {
    const r = await resendStaffAccessGuide(VALID_UUID);

    expect(isMutationError(r)).toBe(false);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "user",
        action: "create",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockGetUser).toHaveBeenCalledWith(VALID_UUID);
    expect(mockSendStaffAccessGuideEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "staff@example.com",
        staffName: "Staff User",
        staffEmail: "staff@example.com",
        roleLabel: "編集者",
        adminUrl: "https://admin.example.com/admin",
        deliveryKey: expect.stringMatching(
          /^resend\/11111111-1111-4111-8111-111111111111\//,
        ),
      }),
    );
  });
});
