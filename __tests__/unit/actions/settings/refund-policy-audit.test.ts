/**
 * updateRefundPolicySettings（設定 Server Action）の AuditLog diff 記録を検証する。
 * tax-audit.test.ts と同一パターン（executeConformMutation / executeAdminMutationResult
 * を薄くモックし、FormData → conform 解析は再テストしない）。
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

const ENABLED_INPUT = {
  refundPolicyEnabled: true,
  refundPolicyTiers: [{ hoursBefore: 24, refundRate: 50 }],
  refundPolicyDefaultRefundRate: 0,
  expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
};

let currentFormInput: typeof ENABLED_INPUT = ENABLED_INPUT;

mock.module("@/shared/lib/forms/conform-action", () => ({
  executeConformMutation: async (
    _formData: FormData,
    _schema: unknown,
    handler: (
      data: typeof ENABLED_INPUT,
    ) => Promise<{ ok: boolean; error?: string }>,
  ) => handler(currentFormInput),
}));

mock.module("@/shared/lib/cache", () => ({
  invalidateSiteWideCache: mock(() => undefined),
}));

mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: { BUSINESS_SETTINGS: "business-settings" },
}));

const mockUpdateRefundPolicyCommand = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

mock.module("@/shared/domain/settings/commands", () => ({
  updateRefundPolicy: (
    ...args: Parameters<typeof mockUpdateRefundPolicyCommand>
  ) => mockUpdateRefundPolicyCommand(...args),
}));

const mockGetRefundPolicySettings = mock<
  () => Promise<{
    policy: {
      tiers: { hoursBefore: number; refundRate: number }[];
      defaultRefundRate: number;
    } | null;
    commerceUpdatedAt: string;
  }>
>(() =>
  Promise.resolve({
    policy: null,
    commerceUpdatedAt: "2026-01-01T00:00:00.000Z",
  }),
);

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getRefundPolicySettings: () => mockGetRefundPolicySettings(),
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

mock.module("./schemas/refund-policy", () => ({ refundPolicyFormSchema: {} }));

const { updateRefundPolicySettings } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/settings/refund-policy");

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateRefundPolicySettings の AuditLog diff", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    currentFormInput = ENABLED_INPUT;
    mockUpdateRefundPolicyCommand.mockReset();
    mockUpdateRefundPolicyCommand.mockResolvedValue(undefined);
    mockGetRefundPolicySettings.mockReset();
    mockGetRefundPolicySettings.mockResolvedValue({
      policy: null,
      commerceUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("未設定 (null) → 有効化を oldValue=null / newValue={tiers,defaultRefundRate} で記録する", async () => {
    await updateRefundPolicySettings(undefined, new FormData());
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["action"]).toBe("UPDATE");
    expect(call["resource"]).toBe("settings.refundPolicy");
    expect(call["oldValue"]).toEqual({ refundPolicy: null });
    expect(call["newValue"]).toEqual({
      refundPolicy: {
        tiers: [{ hoursBefore: 24, refundRate: 50 }],
        defaultRefundRate: 0,
      },
    });
  });

  test("有効設定 → 無効化 (OFF) を newValue=null で記録する", async () => {
    mockGetRefundPolicySettings.mockResolvedValue({
      policy: {
        tiers: [{ hoursBefore: 24, refundRate: 50 }],
        defaultRefundRate: 0,
      },
      commerceUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    currentFormInput = {
      refundPolicyEnabled: false,
      refundPolicyTiers: [],
      refundPolicyDefaultRefundRate: 0,
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    };

    await updateRefundPolicySettings(undefined, new FormData());
    await flushMicrotasks();

    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["oldValue"]).toEqual({
      refundPolicy: {
        tiers: [{ hoursBefore: 24, refundRate: 50 }],
        defaultRefundRate: 0,
      },
    });
    expect(call["newValue"]).toEqual({ refundPolicy: null });
  });
});
