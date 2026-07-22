import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";
import { isMutationError } from "@/shared/lib/mutation-result";

const CUSTOMER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ADMIN_USER_ID = "admin-user-1";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

const mockExecuteAdminMutationResult = mock();
const mockResetCustomerEmailDeliveryStatusCommand = mock();
const mockCreateAuditLogRecord = mock(async () => undefined);
const mockUpdateTag = mock<(tag: string) => void>(() => undefined);

mock.module("server-only", () => ({}));

mock.module("next/cache", () => ({
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  updateTag: mockUpdateTag,
}));

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));

mock.module("@/shared/domain/customers/commands", () => ({
  resetCustomerEmailDeliveryStatusCommand: (
    ...args: Parameters<typeof mockResetCustomerEmailDeliveryStatusCommand>
  ) => mockResetCustomerEmailDeliveryStatusCommand(...args),
  // customer.ts が import する他の command を no-op で足す（実 mutation 経路は他 test で検証）。
  createCustomer: mock(async () => ({ id: "customer-1" })),
  mergeCustomerCommand: mock(async () => ({
    transferredReservations: 0,
    transferredInquiries: 0,
    transferredReviews: 0,
    transferredRegistrations: 0,
  })),
  toggleCustomerActive: mock(async () => ({ previousActive: false })),
  updateCustomer: mock(async () => undefined),
  updateCustomerNotes: mock(async () => ({ previousNotes: null })),
  updateCustomerStatus: mock(async () => undefined),
  anonymizeCustomerCommand: mock(async () => ({
    customerId: CUSTOMER_ID,
    anonymizedAt: new Date(),
    reason: "customer-requested" as const,
    hadUserId: false,
  })),
  recomputeCustomerStatsCommand: mock(async () => undefined),
}));

mock.module("@/shared/domain/customers/risk-detection", () => ({
  clearRiskFlagCommand: mock(async () => ({
    previousFlaggedForReviewAt: null,
    previousFlagReasons: [],
  })),
  // customer.ts が duplicate-detection.ts 経由で reconcileFlagReasonsCommand を
  // 間接 import するため、このファイルの対象外テストでもモック必須(Phase 4)。
  reconcileFlagReasonsCommand: mock(async () => 0),
}));

mock.module("@/shared/domain/customers/queries", () => ({
  searchCustomers: mock(async () => []),
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (
    ...args: Parameters<typeof mockCreateAuditLogRecord>
  ) => mockCreateAuditLogRecord(...args),
}));

// UA-HORIZ-03: buildAuditRequestContext は next/headers 依存の Server Action 内
// helper なので、unit test では固定値を返す stub に差し替える。
mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: () =>
    Promise.resolve({ ip: "127.0.0.1", userAgent: "test-user-agent" }),
}));

// fireAndForget を同期実行 stub に差し替え、afterSuccess 内で発火された Promise を
// 明示的に await できるようにする (admin-event-waitlist.test.ts と同型)。
const firedPromises: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    firedPromises.push(promise.catch(() => undefined));
  },
}));

mock.module("@/admin/lib/action-auth", () => ({
  checkPermission: mock(() => Promise.resolve({ success: true })),
}));

const { resetCustomerEmailDelivery } = await import("@/admin/actions/customer");

// =============================================================================
// Tests
// =============================================================================

describe("resetCustomerEmailDelivery Server Action", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockReset();
    mockResetCustomerEmailDeliveryStatusCommand.mockReset();
    mockCreateAuditLogRecord.mockReset();
    mockCreateAuditLogRecord.mockResolvedValue(undefined);
    mockUpdateTag.mockReset();
    firedPromises.length = 0;
  });

  test("不正な顧客 ID はドメイン層を呼ばず VALIDATION エラーを返す", async () => {
    const result = await resetCustomerEmailDelivery("not-a-uuid");

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.code).toBe("VALIDATION");
    }
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
    expect(mockResetCustomerEmailDeliveryStatusCommand).not.toHaveBeenCalled();
  });

  test("RBAC 拒否 (非 admin) は mutation を実行しない", async () => {
    // executeAdminMutationResult 自体が RBAC 判定して MutationError を返すのを再現する。
    mockExecuteAdminMutationResult.mockResolvedValueOnce({
      error: "customerのupdate権限がありません",
    });

    const result = await resetCustomerEmailDelivery(CUSTOMER_ID);

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.error).toContain("権限");
    }
    // execute にも辿り着かないので command / audit log もキャッシュも触られない
    expect(mockResetCustomerEmailDeliveryStatusCommand).not.toHaveBeenCalled();
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  test("admin: HARD_BOUNCED → OK 成功時にキャッシュ無効化と AuditLog (previous 付き) が発火する", async () => {
    mockResetCustomerEmailDeliveryStatusCommand.mockResolvedValue({
      previous: "HARD_BOUNCED",
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute({ id: ADMIN_USER_ID });
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await resetCustomerEmailDelivery(CUSTOMER_ID);
    await Promise.allSettled(firedPromises);

    expect(isMutationError(result)).toBe(false);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "customer",
        action: "update",
        resourceId: CUSTOMER_ID,
      }),
    );
    expect(mockResetCustomerEmailDeliveryStatusCommand).toHaveBeenCalledWith(
      CUSTOMER_ID,
    );

    // キャッシュ: CUSTOMERS + SUPPRESSED_EMAILS + customers.detail の 3 タグ
    const invalidatedTags = mockUpdateTag.mock.calls.map((c) => c[0]);
    expect(invalidatedTags).toContain("customers");
    expect(invalidatedTags).toContain("suppressed-emails");
    expect(invalidatedTags).toContain(`customers-${CUSTOMER_ID}`);

    // AuditLog: previous 付きで詳細記録される
    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLogRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ADMIN_USER_ID,
        action: "UPDATE",
        resource: "customer.emailDeliveryStatus",
        resourceId: CUSTOMER_ID,
        oldValue: { emailDeliveryStatus: "HARD_BOUNCED" },
        newValue: { emailDeliveryStatus: "OK" },
        metadata: expect.objectContaining({
          customerId: CUSTOMER_ID,
          previousStatus: "HARD_BOUNCED",
          newStatus: "OK",
          actorUserId: ADMIN_USER_ID,
          ip: "127.0.0.1",
          userAgent: "test-user-agent",
        }),
      }),
    );
  });

  test("admin: 既に OK の顧客 (冪等 no-op) は AuditLog もキャッシュ無効化もしない", async () => {
    mockResetCustomerEmailDeliveryStatusCommand.mockResolvedValue({
      previous: "OK",
    });
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      const data = await options.execute({ id: ADMIN_USER_ID });
      await options.afterSuccess?.(data);
      return data;
    });

    const result = await resetCustomerEmailDelivery(CUSTOMER_ID);
    await Promise.allSettled(firedPromises);

    expect(isMutationError(result)).toBe(false);
    // command は呼ばれる（呼び出し側で状態不明のため常に叩く）が、
    // 副作用 (audit log / cache invalidation) は全て skip される。
    expect(mockResetCustomerEmailDeliveryStatusCommand).toHaveBeenCalled();
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });

  test("admin: DomainError NOT_FOUND は MutationError に変換される", async () => {
    mockResetCustomerEmailDeliveryStatusCommand.mockRejectedValue(
      new DomainError("顧客が見つかりません", "NOT_FOUND"),
    );
    // 実装 (admin-action.ts) と同じ DomainError → MutationError 変換を再現する。
    mockExecuteAdminMutationResult.mockImplementation(async (options) => {
      try {
        const data = await options.execute({ id: ADMIN_USER_ID });
        await options.afterSuccess?.(data);
        return data;
      } catch (error) {
        if (error instanceof DomainError) {
          return { error: error.message, code: error.code };
        }
        throw error;
      }
    });

    const result = await resetCustomerEmailDelivery(CUSTOMER_ID);

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.code).toBe("NOT_FOUND");
    }
    // execute が throw したため afterSuccess は呼ばれない
    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
  });
});
