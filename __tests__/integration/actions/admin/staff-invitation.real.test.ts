/**
 * Staff Invitation Server Action 実呼出し統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/staff-invitation.ts の
 * deleteInvitation / resendInvitation / setupPassword を実 import で呼び出す。
 *
 * conform 系 (sendInvitation) は後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockDeleteInvitation = mock(async () => {});
const mockResendInvitation = mock(async () => {});
const mockSetupPassword = mock<(input: unknown) => Promise<{ userId: string }>>(
  () => Promise.resolve({ userId: "user-1" }),
);

mock.module("@/shared/domain/staff-invitations/commands", () => ({
  sendInvitation: mock(async () => ({ id: "inv-x" })),
  deleteInvitation: mockDeleteInvitation,
  resendInvitation: mockResendInvitation,
  setupPassword: mockSetupPassword,
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
  const data = await opts.execute({ id: "admin", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const { deleteInvitation, resendInvitation, setupPassword } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/staff-invitation");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("deleteInvitation (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteInvitation.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteInvitation("bad");
    expect(isMutationError(r)).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test("正常系: resource=user, action=delete", async () => {
    await deleteInvitation(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "user",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteInvitation).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("resendInvitation (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockResendInvitation.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await resendInvitation("bad");
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=user, action=create (resend)", async () => {
    await resendInvitation(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "user",
        action: "create",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockResendInvitation).toHaveBeenCalledWith(VALID_UUID, {
      id: "admin",
      role: "ADMIN",
    });
  });
});

describe("setupPassword (real)", () => {
  beforeEach(() => {
    mockSetupPassword.mockClear();
  });

  test("無効な input は validation error (wrapper 経由しない)", async () => {
    const r = await setupPassword({
      token: "",
      password: "x",
    } as unknown as never);
    expect(isMutationError(r)).toBe(true);
    expect(mockSetupPassword).not.toHaveBeenCalled();
  });

  test("正常系: command が直接呼ばれる (executeAdminMutationResult 不使用)", async () => {
    const password = "ValidPassword1!";
    const r = await setupPassword({
      token: "valid-token-token-token-1234567890",
      password,
      confirmPassword: password,
    } as unknown as never);
    // setupPassword は wrapper を経由しない (未認証経路のため) — 直接 command 実行
    expect(mockSetupPassword).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ userId: "user-1" });
  });
});
