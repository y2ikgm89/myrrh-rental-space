/**
 * updateStripeSettings / clearStripeKeys（設定 Server Action）の AuditLog diff 記録を検証する。
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

const STRIPE_INPUT = {
  stripePublishableKey: "pk_test_1234567890123456",
  stripeSecretKey: "sk_test_newsecret123456",
  stripeWebhookSecret: "whsec_test1234567890",
  stripeCurrency: "jpy" as const,
  stripePaymentMethodTypes: ["card"] as const,
  expectedUpdatedAt: "2026-01-15T00:00:00.000Z",
};

const PREVIOUS_SNAPSHOT = {
  stripePublishableKeyLast4: "3456",
  stripeMode: "test" as const,
  stripeCurrency: "jpy",
  stripePaymentMethodTypes: ["card"],
  stripeSecretKeyConfigured: true,
  stripeWebhookSecretConfigured: false,
};

const NEXT_SNAPSHOT = {
  stripePublishableKeyLast4: "3456",
  stripeMode: "test" as const,
  stripeCurrency: "jpy",
  stripePaymentMethodTypes: ["card"],
  stripeSecretKeyConfigured: true,
  stripeWebhookSecretConfigured: true,
};

mock.module("@/shared/lib/forms/conform-action", () => ({
  executeConformMutation: async (
    _formData: FormData,
    _schema: unknown,
    handler: (
      data: typeof STRIPE_INPUT,
    ) => Promise<{ ok: boolean; error?: string }>,
  ) => handler(STRIPE_INPUT),
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mock(() => undefined),
}));

mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: { INTEGRATION_SETTINGS: "integration-settings" },
}));

const mockUpdateStripeSettingsCommand = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);
const mockClearStripeKeysCommand = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

mock.module("@/shared/domain/settings/integration-commands", () => ({
  updateStripeSettings: (
    ...args: Parameters<typeof mockUpdateStripeSettingsCommand>
  ) => mockUpdateStripeSettingsCommand(...args),
  clearStripeKeys: (...args: Parameters<typeof mockClearStripeKeysCommand>) =>
    mockClearStripeKeysCommand(...args),
}));

let snapshotCallCount = 0;

const mockGetStripeSettingsAuditSnapshot = mock<
  () => Promise<typeof PREVIOUS_SNAPSHOT>
>(() => {
  snapshotCallCount += 1;
  return Promise.resolve(
    snapshotCallCount === 1 ? PREVIOUS_SNAPSHOT : NEXT_SNAPSHOT,
  );
});

mock.module("@/shared/domain/settings/admin-queries", () => ({
  getStripeSettingsAuditSnapshot: () => mockGetStripeSettingsAuditSnapshot(),
  buildStripeSettingsAuditSnapshot: () => ({
    stripePublishableKeyLast4: null,
    stripeMode: null,
    stripeCurrency: "jpy",
    stripePaymentMethodTypes: ["card"],
    stripeSecretKeyConfigured: false,
    stripeWebhookSecretConfigured: false,
  }),
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
  logError: mock(() => undefined),
  normalizeError: (error: unknown) => error,
}));

mock.module("./schemas/form-schemas-security-integrations", () => ({
  stripeFormSchema: {},
}));

const { updateStripeSettings, clearStripeKeys } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/settings/stripe");

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateStripeSettings の AuditLog diff", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    snapshotCallCount = 0;
    mockUpdateStripeSettingsCommand.mockReset();
    mockUpdateStripeSettingsCommand.mockResolvedValue(undefined);
    mockGetStripeSettingsAuditSnapshot.mockReset();
    mockGetStripeSettingsAuditSnapshot.mockImplementation(() => {
      snapshotCallCount += 1;
      return Promise.resolve(
        snapshotCallCount === 1 ? PREVIOUS_SNAPSHOT : NEXT_SNAPSHOT,
      );
    });
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("シークレットローテーションは平文ではなく rotated フラグのみ記録する", async () => {
    await updateStripeSettings(undefined, new FormData());
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["action"]).toBe("UPDATE");
    expect(call["resource"]).toBe("settings.stripe");
    expect(call["userId"]).toBe("admin-1");
    expect(call["oldValue"]).toEqual(PREVIOUS_SNAPSHOT);
    expect(call["newValue"]).toEqual({
      ...NEXT_SNAPSHOT,
      stripeSecretKeyRotated: true,
      stripeWebhookSecretRotated: true,
    });
    expect(JSON.stringify(call["newValue"])).not.toContain("sk_test");
    expect(JSON.stringify(call["newValue"])).not.toContain("whsec_");
  });

  test("before 取得はコマンド実行前に行われる（実行順序）", async () => {
    const callOrder: string[] = [];
    mockGetStripeSettingsAuditSnapshot.mockImplementation(() => {
      callOrder.push("getStripeSettingsAuditSnapshot");
      return Promise.resolve(PREVIOUS_SNAPSHOT);
    });
    mockUpdateStripeSettingsCommand.mockImplementation(() => {
      callOrder.push("updateStripeSettings");
      return Promise.resolve();
    });

    await updateStripeSettings(undefined, new FormData());

    expect(callOrder[0]).toBe("getStripeSettingsAuditSnapshot");
    expect(callOrder[1]).toBe("updateStripeSettings");
    expect(callOrder[2]).toBe("getStripeSettingsAuditSnapshot");
  });
});

describe("clearStripeKeys の AuditLog diff", () => {
  beforeEach(() => {
    currentUser = { id: "admin-1" };
    mockClearStripeKeysCommand.mockReset();
    mockClearStripeKeysCommand.mockResolvedValue(undefined);
    mockGetStripeSettingsAuditSnapshot.mockReset();
    mockGetStripeSettingsAuditSnapshot.mockResolvedValue(PREVIOUS_SNAPSHOT);
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
  });

  test("キークリアを oldValue/newValue で記録する", async () => {
    await clearStripeKeys();
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call["resource"]).toBe("settings.stripe");
    expect(call["oldValue"]).toEqual(PREVIOUS_SNAPSHOT);
    expect(call["newValue"]).toEqual({
      stripePublishableKeyLast4: null,
      stripeMode: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
      stripeSecretKeyConfigured: false,
      stripeWebhookSecretConfigured: false,
    });
  });
});
