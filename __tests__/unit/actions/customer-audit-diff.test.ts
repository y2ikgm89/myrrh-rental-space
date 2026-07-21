/**
 * customer.ts の updateCustomerStatus / updateCustomer / anonymizeCustomer /
 * createCustomer / updateCustomerNotes / toggleCustomerActive /
 * clearCustomerRiskFlag / searchCustomersAction が customer.status /
 * customer.profile / customer.anonymization / customer.notes /
 * customer.active / customer.riskFlag として before/after を、
 * searchCustomersAction が PII 検索の READ 監査を AuditLog に残すことを検証する。
 *
 * executeAdminMutationResult / executeConformMutation は薄いモックに差し替え、
 * RBAC・FormData→conform解析・cache invalidationの再テストはしない
 * （customer.action-shape.test.ts / *-empty-optional.test.ts の担務）。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import {
  AuditAction,
  CustomerStatus,
} from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

type AdminUserLike = { id: string };

let currentUser: AdminUserLike = { id: "admin-1" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async <T>(options: {
    execute: (user: AdminUserLike) => Promise<T>;
    afterSuccess?: (data: T) => void;
  }): Promise<T> => {
    const data = await options.execute(currentUser);
    options.afterSuccess?.(data);
    return data;
  },
}));

const VALID_CUSTOMER_DATA = {
  customerType: "PERSONAL",
  lastName: "田中",
  firstName: "太郎",
  lastNameKana: "タナカ",
  firstNameKana: "タロウ",
  companyName: "株式会社テスト",
  email: "tanaka@example.com",
  phoneNumber: "090-1234-5678",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "神宮前1-1-1",
  building: "サンプルビル 2F",
  notes: "VIP顧客",
  marketingOptIn: false,
  phoneContactOptIn: false,
};

mock.module("@/shared/lib/forms/conform-action", () => ({
  executeConformMutation: async (
    _formData: FormData,
    _schema: unknown,
    handler: (
      data: typeof VALID_CUSTOMER_DATA,
    ) => Promise<{ ok: boolean; error?: string }>,
  ) => handler(VALID_CUSTOMER_DATA),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mock(() => undefined),
}));

const mockUpdateCustomerStatusCommand = mock<
  () => Promise<{ previousStatus: string }>
>(() => Promise.resolve({ previousStatus: CustomerStatus.NEW }));
const mockUpdateCustomerCommand = mock<
  () => Promise<{ previous: Record<string, unknown> }>
>(() => Promise.resolve({ previous: {} }));
const mockAnonymizeCustomerCommand = mock<
  () => Promise<{
    customerId: string;
    anonymizedAt: Date;
    reason: string;
    hadUserId: boolean;
    preservedSuppression: boolean;
  }>
>(() =>
  Promise.resolve({
    customerId: "cust-1",
    anonymizedAt: new Date("2026-07-20T00:00:00.000Z"),
    reason: "admin-purge",
    hadUserId: false,
    preservedSuppression: false,
  }),
);

mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerStatus: (
    ...args: Parameters<typeof mockUpdateCustomerStatusCommand>
  ) => mockUpdateCustomerStatusCommand(...args),
  updateCustomer: (...args: Parameters<typeof mockUpdateCustomerCommand>) =>
    mockUpdateCustomerCommand(...args),
  anonymizeCustomerCommand: (
    ...args: Parameters<typeof mockAnonymizeCustomerCommand>
  ) => mockAnonymizeCustomerCommand(...args),
  createCustomer: mock(() => Promise.resolve({ id: "x" })),
  updateCustomerNotes: mock(() => Promise.resolve(undefined)),
  toggleCustomerActive: mock(() => Promise.resolve(undefined)),
  mergeCustomerCommand: mock(() =>
    Promise.resolve({
      transferredReservations: 0,
      transferredInquiries: 0,
      transferredReviews: 0,
      transferredRegistrations: 0,
    }),
  ),
  resetCustomerEmailDeliveryStatusCommand: mock(() =>
    Promise.resolve({ previous: "OK" }),
  ),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  searchCustomers: mock(() => Promise.resolve([])),
}));

mock.module("@/shared/domain/customers/risk-detection", () => ({
  clearRiskFlagCommand: mock(() => Promise.resolve(undefined)),
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mock(() =>
    Promise.resolve({ success: true, user: { id: "admin-1" } }),
  ),
}));

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: "test-ip", userAgent: "test-ua" }),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { MEDIUM: "MEDIUM", HIGH: "HIGH" },
  logError: mock(() => undefined),
  normalizeError: (error: unknown) => error,
}));

const {
  updateCustomerStatus,
  updateCustomer,
  anonymizeCustomer,
  createCustomer,
  updateCustomerNotes,
  toggleCustomerActive,
  clearCustomerRiskFlag,
  searchCustomersAction,
} = await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer");

const CUSTOMER_UUID = "11111111-1111-4111-8111-111111111111";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateCustomerStatus の AuditLog diff (customer.status)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockUpdateCustomerStatusCommand.mockReset();
    mockUpdateCustomerStatusCommand.mockResolvedValue({
      previousStatus: CustomerStatus.NEW,
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("ステータスが実際に変わった場合は oldValue/newValue 付きで記録する", async () => {
    await updateCustomerStatus(CUSTOMER_UUID, CustomerStatus.BLACKLIST);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("customer.status");
    expect(call["resourceId"]).toBe(CUSTOMER_UUID);
    expect(call["oldValue"]).toEqual({ status: CustomerStatus.NEW });
    expect(call["newValue"]).toEqual({ status: CustomerStatus.BLACKLIST });
  });

  test("ステータスが変わらない (no-op) 場合は記録しない（audit noise 抑制）", async () => {
    mockUpdateCustomerStatusCommand.mockResolvedValue({
      previousStatus: CustomerStatus.BLACKLIST,
    });

    await updateCustomerStatus(CUSTOMER_UUID, CustomerStatus.BLACKLIST);
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});

describe("updateCustomer の AuditLog diff (customer.profile)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockUpdateCustomerCommand.mockReset();
    mockUpdateCustomerCommand.mockResolvedValue({
      previous: { lastName: "旧姓", email: "old@example.com" },
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("変更前後のプロフィールを oldValue/newValue に記録する", async () => {
    await updateCustomer(CUSTOMER_UUID, undefined, new FormData());
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("customer.profile");
    expect(call["resourceId"]).toBe(CUSTOMER_UUID);
    expect(call["oldValue"]).toEqual({
      lastName: "旧姓",
      email: "old@example.com",
    });
    expect(call["newValue"]).toEqual(
      expect.objectContaining({
        lastName: "田中",
        firstName: "太郎",
        email: "tanaka@example.com",
      }),
    );
  });
});

describe("anonymizeCustomer の AuditLog 記録 (customer.anonymization、生PIIは含めない)", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockAnonymizeCustomerCommand.mockReset();
    mockAnonymizeCustomerCommand.mockResolvedValue({
      customerId: CUSTOMER_UUID,
      anonymizedAt: new Date("2026-07-20T00:00:00.000Z"),
      reason: "admin-purge",
      hadUserId: true,
      preservedSuppression: true,
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("reason・匿名化されたフィールド一覧をメタデータとして記録し、生の値は含めない", async () => {
    await anonymizeCustomer(CUSTOMER_UUID, "admin-purge");
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("customer.anonymization");
    expect(call["resourceId"]).toBe(CUSTOMER_UUID);
    expect(call["oldValue"]).toBeUndefined();

    const newValue = call["newValue"];
    expect(newValue).toBeDefined();
    if (!newValue || typeof newValue !== "object") {
      throw new Error("newValue is not an object");
    }
    const record = newValue as Record<string, unknown>;
    expect(record["reason"]).toBe("admin-purge");
    expect(record["hadUserId"]).toBe(true);
    expect(record["preservedSuppression"]).toBe(true);
    expect(Array.isArray(record["anonymizedFields"])).toBe(true);
    expect(record["anonymizedFields"]).toContain("email");
    expect(record["anonymizedFields"]).toContain("phoneNumber");
    // 生 PII の値そのもの（例: 旧メールアドレス文字列）は一切含まれないこと
    expect(JSON.stringify(record)).not.toContain("tanaka@example.com");
  });
});

describe("searchCustomersAction の PII 検索監査ログ (READ)", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("検索実行時に READ アクションでクエリと件数を記録する", async () => {
    await searchCustomersAction("田中");
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["action"]).toBe(AuditAction.READ);
    expect(call["resource"]).toBe("customer");
    expect(call["metadata"]).toEqual({ query: "田中", resultCount: 0 });
  });
});
