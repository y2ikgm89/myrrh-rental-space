import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installNextCacheMock } from "../../support/next-cache-mock";

installNextCacheMock();

type RateLimitCheckResult =
  { success: true } | { success: false; error: string };

const mockExecuteAdminMutationResult = mock();
const mockSendCustomerBroadcast = mock();
const mockCheckActionRateLimit = mock<() => Promise<RateLimitCheckResult>>(
  async () => ({ success: true }),
);

// customer/bulk.ts の module-top-level import 全てを解決可能にする必要がある
// (reservation-cancellation-reason.test.ts と同型の網羅 mock。この特定 action は
// これらを呼ばないが、同一ファイル内の他 export の import が module load 時に
// 評価されるため、実 DB / next request context に依存するモジュールは全て
// スタブ化する)。
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));
mock.module("@/admin/lib/audit", () => ({
  emitBulkAuditRecords: mock(() => undefined),
}));
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: (
    ...args: Parameters<typeof mockCheckActionRateLimit>
  ) => mockCheckActionRateLimit(...args),
  createValidationMutationError: (error: unknown) => ({
    error: "validation failed",
    code: "VALIDATION",
    zodError: error,
  }),
}));
mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: null, userAgent: null }),
}));
mock.module("@/shared/domain/customers/bulk-commands", () => ({
  bulkToggleActiveCustomersCommand: mock(),
  bulkAnonymizeCustomersCommand: mock(),
}));
mock.module("@/shared/domain/customers/bulk-status-commands", () => ({
  bulkSetStatusCustomersCommand: mock(),
}));
mock.module("@/shared/domain/email/dispatch", () => ({
  sendCustomerBroadcast: (
    ...args: Parameters<typeof mockSendCustomerBroadcast>
  ) => mockSendCustomerBroadcast(...args),
}));
mock.module("@/shared/lib/rate-limit", () => ({
  customerBroadcastRateLimiter: { check: mock(async () => true) },
}));

const { broadcastCustomersAction } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/customer/bulk");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// bulk.ts の他の export が使う既存 fixture 規約
// (__tests__/integration/actions/admin/customer-bulk.test.ts) を踏襲。
const CUSTOMER_ID_1 = "11111111-1111-4111-8111-111111111111";
const CUSTOMER_ID_2 = "22222222-2222-4222-8222-222222222222";

describe("broadcastCustomersAction", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockSendCustomerBroadcast.mockReset();
    mockCheckActionRateLimit.mockReset();
    mockCheckActionRateLimit.mockImplementation(
      async () => ({ success: true }) as const,
    );
    mockExecuteAdminMutationResult.mockImplementation(async (options) =>
      options.execute({ id: "admin-1" }),
    );
  });

  test("空文字の subject は VALIDATION エラーになる", async () => {
    const result = await broadcastCustomersAction(
      [CUSTOMER_ID_1],
      "",
      "本文です",
    );
    expect(isMutationError(result)).toBe(true);
    expect(mockSendCustomerBroadcast).not.toHaveBeenCalled();
  });

  test("重複した customerId は VALIDATION エラーになる", async () => {
    const result = await broadcastCustomersAction(
      [CUSTOMER_ID_1, CUSTOMER_ID_1],
      "お知らせ",
      "本文です",
    );
    expect(isMutationError(result)).toBe(true);
    expect(mockSendCustomerBroadcast).not.toHaveBeenCalled();
  });

  test("レート制限に達した場合は MutationError を返す", async () => {
    mockCheckActionRateLimit.mockImplementation(async () => ({
      success: false,
      error: "リクエストが多すぎます。しばらく経ってから再度お試しください。",
    }));

    const result = await broadcastCustomersAction(
      [CUSTOMER_ID_1],
      "お知らせ",
      "本文です",
    );

    expect(isMutationError(result)).toBe(true);
    expect(mockSendCustomerBroadcast).not.toHaveBeenCalled();
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
  });

  test("正しい入力で sendCustomerBroadcast を呼び sent/excluded を返す", async () => {
    mockSendCustomerBroadcast.mockResolvedValue({
      ok: true,
      sent: 1,
      excluded: 1,
    });

    const result = await broadcastCustomersAction(
      [CUSTOMER_ID_1, CUSTOMER_ID_2],
      "お知らせ",
      "本文です",
    );

    expect(isMutationError(result)).toBe(false);
    if (!isMutationError(result)) {
      expect(result.sent).toBe(1);
      expect(result.excluded).toBe(1);
    }
    expect(mockSendCustomerBroadcast).toHaveBeenCalledWith(
      [CUSTOMER_ID_1, CUSTOMER_ID_2],
      expect.objectContaining({ subject: "お知らせ", body: "本文です" }),
    );
  });
});
