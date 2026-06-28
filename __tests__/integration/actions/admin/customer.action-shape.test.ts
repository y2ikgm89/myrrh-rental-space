/**
 * Customer Server Action — action shape & schema 統合テスト
 *
 * **scope**: action 関数の input validation / executeAdminMutationResult への
 * options shape (resource / action / resourceId) / domain command への引数伝搬
 * のみを実 import で検証する。`executeAdminMutationResult` は mock しており
 * **auth / RBAC / cache invalidation / 監査ログは検証しない**。
 * end-to-end な auth + RBAC + cache + audit の検証は
 * `_executeAdminMutationResult-rbac.test.ts` を参照。
 *
 * 対象: updateCustomerStatus / updateCustomerNotes / toggleCustomerActive /
 * deleteCustomer / mergeCustomers
 *
 * conform 系 (createCustomer / updateCustomer) は customerFormSchema が
 * 巨大なため後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

const mockUpdateStatus = mock(async () => {});
const mockUpdateNotes = mock(async () => {});
const mockToggleActive = mock(async () => {});
const mockDeleteCustomer = mock(async () => {});
const mockMerge = mock(async () => ({
  transferredReservations: 1,
  transferredInquiries: 0,
  transferredReviews: 0,
  transferredRegistrations: 0,
}));

mock.module("@/shared/domain/customers/commands", () => ({
  createCustomer: mock(async () => ({ id: "x" })),
  updateCustomer: mock(async () => {}),
  updateCustomerStatus: mockUpdateStatus,
  updateCustomerNotes: mockUpdateNotes,
  toggleCustomerActive: mockToggleActive,
  deleteCustomer: mockDeleteCustomer,
  mergeCustomerCommand: mockMerge,
  updateCustomerFromGuestData: mock(async () => {}),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  searchCustomers: mock(async () => []),
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mock(async () => ({ success: true })),
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

const {
  updateCustomerStatus,
  updateCustomerNotes,
  toggleCustomerActive,
  deleteCustomer,
  mergeCustomers,
} = await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

describe("updateCustomerStatus (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateStatus.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateCustomerStatus("bad", CustomerStatus.NEW);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=customer, action=update", async () => {
    await updateCustomerStatus(VALID_UUID, CustomerStatus.REGULAR);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "customer",
        action: "update",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      VALID_UUID,
      CustomerStatus.REGULAR,
    );
  });
});

describe("updateCustomerNotes (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateNotes.mockClear();
  });

  test("正常系: notes 更新を command に伝搬", async () => {
    await updateCustomerNotes(VALID_UUID, "メモ");
    expect(mockUpdateNotes).toHaveBeenCalledWith(VALID_UUID, "メモ");
  });

  test("正常系: null notes は許容", async () => {
    await updateCustomerNotes(VALID_UUID, null);
    expect(mockUpdateNotes).toHaveBeenCalledWith(VALID_UUID, null);
  });
});

describe("toggleCustomerActive (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockToggleActive.mockClear();
  });

  test("正常系: resource=customer, action=update", async () => {
    await toggleCustomerActive(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "customer",
        action: "update",
      }),
    );
    expect(mockToggleActive).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("deleteCustomer (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteCustomer.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteCustomer("bad");
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=customer, action=delete", async () => {
    await deleteCustomer(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "customer",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteCustomer).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("mergeCustomers (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockMerge.mockClear();
  });

  test("無効な id は error 返却", async () => {
    const r = await mergeCustomers("bad", VALID_UUID);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=customer, action=delete (merge)", async () => {
    await mergeCustomers(VALID_UUID, VALID_UUID_B);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "customer",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockMerge).toHaveBeenCalledWith(VALID_UUID, VALID_UUID_B);
  });
});
