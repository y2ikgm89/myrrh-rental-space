/**
 * updateDiscountSettings（設定 Server Action）の AuditLog diff 記録を検証する。
 * tax-audit.test.ts と同一パターン（executeConformMutation / executeAdminMutationResult
 * を薄くモックし、FormData → conform 解析は再テストしない）。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { DiscountCombinationMode } from "@/shared/lib/validations/enums/prisma-types";

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

/**
 * 監査 A-101: 以前は enum に存在しない値を fixture に使っていた
 * （実在するのは `BEST` / `BOTH` の 2 値だけ）。mock の型が `string` だったため
 * 型検査も通り、zod スキーマも差し替えられていたのでパースも走らなかった。
 *
 * before / after を**違う実値**にしてある。同じ値だとこの列は
 * oldValue / newValue の diff を一切検査していないことになる。
 */
const DISCOUNT_MODE_BEFORE: DiscountCombinationMode = "BEST";
const DISCOUNT_MODE_AFTER: DiscountCombinationMode = "BOTH";

const DISCOUNT_INPUT = {
  durationDiscountEnabled: true,
  durationDiscountRules: [{ hours: 3, discountRate: 10 }],
  discountCombinationMode: DISCOUNT_MODE_AFTER,
  showOriginalPrice: true,
};

mock.module("@/shared/lib/forms/conform-action", () => ({
  executeConformMutation: async (
    _formData: FormData,
    _schema: unknown,
    handler: (
      data: typeof DISCOUNT_INPUT,
    ) => Promise<{ ok: boolean; error?: string }>,
  ) => handler(DISCOUNT_INPUT),
}));

mock.module("@/shared/lib/cache", () => ({
  invalidateSiteWideCache: mock(() => undefined),
}));

mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: { BUSINESS_SETTINGS: "business-settings" },
}));

const mockUpdateDiscountSettingsCommand = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

mock.module("@/shared/domain/settings/commands/commerce", () => ({
  updateDiscountSettings: (
    ...args: Parameters<typeof mockUpdateDiscountSettingsCommand>
  ) => mockUpdateDiscountSettingsCommand(...args),
}));

const mockGetDiscountSettings = mock<
  () => Promise<{
    durationDiscountEnabled: boolean;
    durationDiscountRules: { hours: number; discountRate: number }[];
    discountCombinationMode: DiscountCombinationMode;
    showOriginalPrice: boolean;
  }>
>(() =>
  Promise.resolve({
    durationDiscountEnabled: false,
    durationDiscountRules: [],
    discountCombinationMode: DISCOUNT_MODE_BEFORE,
    showOriginalPrice: false,
  }),
);

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getDiscountSettings: () => mockGetDiscountSettings(),
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

mock.module("./schemas/form-schemas-security-integrations", () => ({
  discountFormSchema: {},
}));

const { updateDiscountSettings } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/settings/discount");

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateDiscountSettings の AuditLog diff", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockUpdateDiscountSettingsCommand.mockReset();
    mockUpdateDiscountSettingsCommand.mockResolvedValue(undefined);
    mockGetDiscountSettings.mockReset();
    mockGetDiscountSettings.mockResolvedValue({
      durationDiscountEnabled: false,
      durationDiscountRules: [],
      discountCombinationMode: DISCOUNT_MODE_BEFORE,
      showOriginalPrice: false,
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("無効→有効かつルール追加を oldValue/newValue に記録する", async () => {
    await updateDiscountSettings(undefined, new FormData());
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["action"]).toBe("UPDATE");
    expect(call["resource"]).toBe("settings.discount");
    expect(call["userId"]).toBe("admin-1");
    expect(call["oldValue"]).toEqual({
      durationDiscountEnabled: false,
      durationDiscountRules: [],
      discountCombinationMode: DISCOUNT_MODE_BEFORE,
      showOriginalPrice: false,
    });
    expect(call["newValue"]).toEqual(DISCOUNT_INPUT);
  });

  test("before 取得はコマンド実行前に行われる（実行順序）", async () => {
    const callOrder: string[] = [];
    mockGetDiscountSettings.mockImplementation(() => {
      callOrder.push("getDiscountSettings");
      return Promise.resolve({
        durationDiscountEnabled: false,
        durationDiscountRules: [],
        discountCombinationMode: DISCOUNT_MODE_BEFORE,
        showOriginalPrice: false,
      });
    });
    mockUpdateDiscountSettingsCommand.mockImplementation(() => {
      callOrder.push("updateDiscountSettings");
      return Promise.resolve();
    });

    await updateDiscountSettings(undefined, new FormData());

    expect(callOrder).toEqual([
      "getDiscountSettings",
      "updateDiscountSettings",
    ]);
  });
});
