/**
 * updateTaxSettings（設定 Server Action）の AuditLog diff 記録を検証する。
 *
 * executeConformMutation / executeAdminMutationResult は薄いモックに差し替え、
 * FormData → conform 解析の再テストはしない（*-empty-optional.test.ts の担務）。
 * ここでの主対象は「税率変更が oldValue/newValue 付きで AuditLog に残る」こと。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

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

const TAX_INPUT = {
  taxStandardRate: 10,
  taxReducedRate: 8,
  taxDisplayModePublic: "TAX_INCLUDED",
};

mock.module("@/shared/lib/forms/conform-action", () => ({
  executeConformMutation: async (
    _formData: FormData,
    _schema: unknown,
    handler: (
      data: typeof TAX_INPUT,
    ) => Promise<{ ok: boolean; error?: string }>,
  ) => handler(TAX_INPUT),
}));

mock.module("@/shared/lib/cache", () => ({
  invalidateSiteWideCache: mock(() => undefined),
}));

mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: { BUSINESS_SETTINGS: "business-settings" },
}));

const mockUpdateTaxSettingsCommand = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

mock.module("@/shared/domain/settings/commands/commerce", () => ({
  updateTaxSettings: (
    ...args: Parameters<typeof mockUpdateTaxSettingsCommand>
  ) => mockUpdateTaxSettingsCommand(...args),
}));

const mockGetTaxSettings = mock<
  () => Promise<{
    standardRate: number;
    reducedRate: number;
    displayModePublic: string;
  }>
>(() =>
  Promise.resolve({
    standardRate: 10,
    reducedRate: 8,
    displayModePublic: "TAX_INCLUDED",
  }),
);

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getTaxSettings: () => mockGetTaxSettings(),
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
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

mock.module("./schemas", () => ({ taxSettingsSchema: {} }));

const { updateTaxSettings } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/settings/tax");

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateTaxSettings の AuditLog diff", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockUpdateTaxSettingsCommand.mockReset();
    mockUpdateTaxSettingsCommand.mockResolvedValue(undefined);
    mockGetTaxSettings.mockReset();
    mockGetTaxSettings.mockResolvedValue({
      standardRate: 10,
      reducedRate: 8,
      displayModePublic: "TAX_INCLUDED",
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("変更前 (10%/8%) → 変更後 (12%/9%) を oldValue/newValue に記録する", async () => {
    mockGetTaxSettings.mockResolvedValue({
      standardRate: 10,
      reducedRate: 8,
      displayModePublic: "TAX_INCLUDED",
    });

    await updateTaxSettings(undefined, new FormData());
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["action"]).toBe("UPDATE");
    expect(call["resource"]).toBe("settings.tax");
    expect(call["userId"]).toBe("admin-1");
    expect(call["oldValue"]).toEqual({
      taxStandardRate: 10,
      taxReducedRate: 8,
      taxDisplayModePublic: "TAX_INCLUDED",
    });
    expect(call["newValue"]).toEqual({
      taxStandardRate: 10,
      taxReducedRate: 8,
      taxDisplayModePublic: "TAX_INCLUDED",
    });
  });

  test("実際に値が変わった場合は before/after が異なる値として残る", async () => {
    mockGetTaxSettings.mockResolvedValue({
      standardRate: 8,
      reducedRate: 5,
      displayModePublic: "TAX_EXCLUDED",
    });

    await updateTaxSettings(undefined, new FormData());
    await flushMicrotasks();

    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["oldValue"]).toEqual({
      taxStandardRate: 8,
      taxReducedRate: 5,
      taxDisplayModePublic: "TAX_EXCLUDED",
    });
    expect(call["newValue"]).toEqual({
      taxStandardRate: 10,
      taxReducedRate: 8,
      taxDisplayModePublic: "TAX_INCLUDED",
    });
  });

  test("before 取得はコマンド実行前に行われる（実行順序）", async () => {
    const callOrder: string[] = [];
    mockGetTaxSettings.mockImplementation(() => {
      callOrder.push("getTaxSettings");
      return Promise.resolve({
        standardRate: 10,
        reducedRate: 8,
        displayModePublic: "TAX_INCLUDED",
      });
    });
    mockUpdateTaxSettingsCommand.mockImplementation(() => {
      callOrder.push("updateTaxSettings");
      return Promise.resolve();
    });

    await updateTaxSettings(undefined, new FormData());

    expect(callOrder).toEqual(["getTaxSettings", "updateTaxSettings"]);
  });
});
