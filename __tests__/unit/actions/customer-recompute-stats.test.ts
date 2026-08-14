import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockTransaction = mock();
const mockRecomputeCustomerReservationStats = mock(async () => undefined);

mock.module("@/shared/db/prisma", () => ({
  prisma: { $transaction: (...args: unknown[]) => mockTransaction(...args) },
}));
mock.module("@/shared/domain/reservations/payloads", () => ({
  recomputeCustomerReservationStats: (
    ...args: Parameters<typeof mockRecomputeCustomerReservationStats>
  ) => mockRecomputeCustomerReservationStats(...args),
}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
}));
mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: null, userAgent: null }),
}));
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(async () => undefined),
}));
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
}));

const mockRecomputeCustomerStatsCommand = mock(async () => undefined);

// Mock enough of the commands to allow the action file to import,
// even though we're only testing recomputeCustomerStatsCommand
mock.module("@/shared/domain/customers/commands", () => ({
  anonymizeCustomerCommand: mock(() => Promise.resolve({})),
  createCustomer: mock(() => Promise.resolve({ id: "" })),
  mergeCustomerCommand: mock(() => Promise.resolve({})),
  recomputeCustomerStatsCommand: (
    ...args: Parameters<typeof mockRecomputeCustomerStatsCommand>
  ) => mockRecomputeCustomerStatsCommand(...args),
  resetCustomerEmailDeliveryStatusCommand: mock(() =>
    Promise.resolve({ previous: "OK" }),
  ),
  toggleCustomerActive: mock(() => Promise.resolve({})),
  updateCustomer: mock(() => Promise.resolve({ previous: {} })),
  updateCustomerNotes: mock(() => Promise.resolve({ previousNotes: null })),
  updateCustomerStatus: mock(() => Promise.resolve({ previousStatus: "" })),
}));

mock.module("@/app/(admin)/admin/(dashboard)/_shared/lib/action-auth", () => ({
  checkAdminAuth: mock(() =>
    Promise.resolve({ success: true, user: { id: "admin-1", role: "admin" } }),
  ),
  logAction: mock(() => Promise.resolve()),
  checkPermission: mock(() => true),
}));

mock.module("@/shared/lib/admin-permissions", () => ({
  hasPermission: mock(() => true),
}));

mock.module("@/shared/domain/admin-auth/resource-access", () => ({
  userHasResourceAccess: mock(() => Promise.resolve(true)),
}));

mock.module("@/shared/lib/admin-role-guards", () => ({
  isEditorRole: mock(() => false),
}));

mock.module("@/admin/lib/audit", () => ({
  recordPermissionDenied: mock(() => undefined),
}));

mock.module("@/shared/lib/cache/batcher", () => ({
  withPurgeBatch: (fn: () => Promise<unknown>) => fn(),
  queueTagPurge: mock(() => undefined),
}));

mock.module("@/shared/domain/domain-error", () => ({
  DomainError: class DomainError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
  isDomainError: (error: unknown) => error instanceof Error && "code" in error,
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" },
  logError: mock(() => undefined),
  normalizeError: (error: unknown) => error,
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  safeFetch: async <T>(opts: { fetch: () => Promise<T>; fallback: T }) => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  criticalFetch: async <T>(opts: { fetch: () => Promise<T> }) => opts.fetch(),
}));

// Valid UUID format
const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("recomputeCustomerStatsAction", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({}),
    );
    mockRecomputeCustomerReservationStats.mockReset();
    mockRecomputeCustomerReservationStats.mockResolvedValue(undefined);
    mockRecomputeCustomerStatsCommand.mockReset();
    mockRecomputeCustomerStatsCommand.mockResolvedValue(undefined);
  });

  test("不正な顧客IDは VALIDATION エラーになる", async () => {
    const { recomputeCustomerStatsAction } =
      await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer");
    const { isMutationError } = await import("@/shared/lib/mutation-result");

    const result = await recomputeCustomerStatsAction("not-a-uuid");
    expect(isMutationError(result)).toBe(true);
  });

  test("正しい顧客IDでコマンドを呼ぶ", async () => {
    const { recomputeCustomerStatsAction } =
      await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer");
    const { isMutationError } = await import("@/shared/lib/mutation-result");

    const result = await recomputeCustomerStatsAction(CUSTOMER_ID);

    // Should not be an error
    expect(isMutationError(result)).toBe(false);
    // The mocked command should have been called
    expect(mockRecomputeCustomerStatsCommand).toHaveBeenCalledWith(CUSTOMER_ID);
  });
});
