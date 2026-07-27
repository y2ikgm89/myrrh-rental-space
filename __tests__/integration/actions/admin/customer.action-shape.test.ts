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
 * anonymizeCustomer / mergeCustomers
 *
 * conform 系 (createCustomer / updateCustomer) は customerFormSchema が
 * 巨大なため後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CustomerStatus } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

const mockUpdateStatus = mock(async () => ({
  previousStatus: CustomerStatus.NEW,
}));
const mockUpdateNotes = mock(async () => ({ previousNotes: null }));
const mockToggleActive = mock(async () => ({ previousActive: true }));
const mockAnonymizeCustomer = mock<
  (input: { customerId: string; reason: string }) => Promise<{
    customerId: string;
    anonymizedAt: Date;
    reason: string;
    hadUserId: boolean;
    preservedSuppression: boolean;
  }>
>(async ({ customerId, reason }) => ({
  customerId,
  anonymizedAt: new Date(),
  reason,
  hadUserId: false,
  preservedSuppression: false,
}));
const mockMerge = mock(async () => ({
  transferredReservations: 1,
  transferredInquiries: 0,
  transferredReviews: 0,
  transferredRegistrations: 0,
}));

mock.module("@/shared/domain/customers/commands", () => ({
  createCustomer: mock(async () => ({ id: "x" })),
  updateCustomer: mock(async () => ({ previous: {} })),
  updateCustomerStatus: mockUpdateStatus,
  updateCustomerNotes: mockUpdateNotes,
  toggleCustomerActive: mockToggleActive,
  updateCustomerFromGuestData: mock(async () => {}),
  anonymizeCustomerCommand: mockAnonymizeCustomer,
  mergeCustomerCommand: mockMerge,
  resetCustomerEmailDeliveryStatusCommand: mock(async () => ({
    previous: "OK",
  })),
  // customer.ts が recomputeCustomerStatsCommand を直接 import するため、
  // このファイル自体は対象外テストでもモック必須(Phase 4)。
  recomputeCustomerStatsCommand: mock(async () => undefined),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  searchCustomers: mock(async () => []),
  hashSuppressedEmailCandidate: (email: string) => `hash:${email}`,
  isSuppressedDeliveryStatus: (status: string) =>
    status === "HARD_BOUNCED" || status === "COMPLAINED",
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

// updateCustomerStatus / anonymizeCustomer が customer.status / customer.anonymization
// として明示的な監査ログを追加したための mock（このファイル自体は監査ログの内容は
// 検証しない — 冒頭コメントの scope note どおり、shape のみ）。
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(async () => undefined),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: mock(async () => ({
    ip: "test-ip",
    userAgent: "test-ua",
  })),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
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
  anonymizeCustomer,
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

describe("anonymizeCustomer (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockAnonymizeCustomer.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await anonymizeCustomer("bad", "customer-requested");
    expect(isMutationError(r)).toBe(true);
  });

  test("無効な reason は validation error", async () => {
    // 意図的に schema 外の値を渡して VALIDATION 分岐に到達させる。
    // enum を無効化するため runtime 側キャストで型を騙す。
    const invalidReason = "invalid-reason" as unknown as Parameters<
      typeof anonymizeCustomer
    >[1];
    const r = await anonymizeCustomer(VALID_UUID, invalidReason);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=customer, action=delete, reason 伝搬", async () => {
    await anonymizeCustomer(VALID_UUID, "admin-purge");
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "customer",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockAnonymizeCustomer).toHaveBeenCalledWith({
      customerId: VALID_UUID,
      reason: "admin-purge",
    });
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
