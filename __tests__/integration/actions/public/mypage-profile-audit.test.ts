/**
 * SEC-MYPAGE-02: マイページの updateProfileAction / deleteAccountAction が
 * 成功時に AuditLog を emit することを検証する。
 *
 * 実 DB は使わない (mock で `createAuditLogRecord` の呼び出しシグネチャを検査)。
 * `mypage-profile.test.ts` / `mypage-account.test.ts` から audit 責務だけを分離
 * したファイル。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: mock(() => new Headers()),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);
const mockValidateTurnstile = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mockValidateTurnstile,
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  publicQueryRateLimiter: {},
  getClientIpFromHeaders: mock(() => Promise.resolve("test-ip")),
}));

const mockUpdateCustomerProfileByUserId = mock((): Promise<void> =>
  Promise.resolve(),
);
mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerProfileByUserId: mockUpdateCustomerProfileByUserId,
}));

const mockGetCustomerByUserId = mock(() =>
  Promise.resolve({ id: "customer-001" }),
);
mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mock(() => Promise.resolve(undefined)),
  ensureCustomerNotBlacklisted: mock(() => Promise.resolve(undefined)),
}));

mock.module("@/shared/domain/users/queries", () => ({
  getAccountProviders: mock(() => Promise.resolve(["google"])),
}));

const mockDeleteUser = mock(() => Promise.resolve(undefined));
const mockGetSession = mock(
  (): Promise<{ user: { id: string; name: string } } | null> =>
    Promise.resolve({
      user: { id: "user-001", name: "テストユーザー" },
    }),
);
mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetSession,
  customerAuth: { api: { deleteUser: mockDeleteUser } },
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
}));

mock.module("@/shared/lib/admin-auth", () => ({
  getAdminSession: mock(() => Promise.resolve(null)),
  getCurrentAdminUser: mock(() => Promise.resolve(null)),
  verifyAdminSession: mock(() => Promise.resolve(null)),
  getAdminSessionUser: () => null,
  isAdmin: mock(() => Promise.resolve(false)),
  isValidRole: () => false,
  adminAuth: {},
  DASHBOARD_ROLES: [],
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: mock((err: unknown) => err),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
  safeFetch: mock(() => Promise.resolve(null)),
  criticalFetch: mock(() => Promise.resolve(null)),
}));

// SEC-MYPAGE-02: この test の主対象。呼び出しを捕捉する。
type CreateAuditLogRecordInput = {
  readonly userId?: string;
  readonly action: string;
  readonly resource: string;
  readonly resourceId?: string;
  readonly newValue?: unknown;
  readonly metadata?: unknown;
};
const mockCreateAuditLogRecord = mock(
  (_input: CreateAuditLogRecordInput): Promise<void> => Promise.resolve(),
);
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLogRecord,
}));

// buildAuditRequestContext は headers/rate-limit を触るが、テストで壊れないよう
// スタブ化して固定値を返す。
mock.module("@/shared/lib/audit-request-context", () => ({
  buildAuditRequestContext: mock(() =>
    Promise.resolve({ ip: "test-ip", userAgent: "test-ua" }),
  ),
}));

// fireAndForget は next/server の `after()` に依存しリクエストスコープ外で throw
// する。テストでは同期的に promise を実行してから返るスタブに置き換えて、audit
// 呼び出しが確実に捕捉されるようにする。
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    // 呼び出し側の期待 (返り値 void) を維持しつつ、失敗を潰す。
    void promise.catch(() => undefined);
  },
  settleAllWithLogging: mock(() => Promise.resolve([])),
  withTimeout: mock((p: Promise<unknown>) => p),
}));

// =============================================================================
// テスト本体
// =============================================================================

type ProfileInputShape = {
  customerType?: "PERSONAL" | "CORPORATE";
  lastName: string;
  firstName: string;
  companyName?: string;
  phoneNumber?: string;
  email?: string;
  turnstileToken?: string;
};

function inputToFormData(input: ProfileInputShape): FormData {
  const fd = new FormData();
  if (input.customerType !== undefined) {
    fd.append("customerType", input.customerType);
  }
  fd.append("lastName", input.lastName);
  fd.append("firstName", input.firstName);
  if (input.companyName !== undefined) {
    fd.append("companyName", input.companyName);
  }
  if (input.phoneNumber !== undefined) {
    fd.append("phoneNumber", input.phoneNumber);
  }
  if (input.email !== undefined) {
    fd.append("email", input.email);
  }
  if (input.turnstileToken !== undefined) {
    fd.append("turnstileToken", input.turnstileToken);
  }
  return fd;
}

const VALID_PROFILE_INPUT: ProfileInputShape = {
  customerType: "PERSONAL",
  lastName: "山田",
  firstName: "太郎",
  phoneNumber: "090-1234-5678",
};

async function flushMicrotasks(): Promise<void> {
  // fireAndForget モックが `promise.catch` を仕込む → その microtask を排出。
  await Promise.resolve();
  await Promise.resolve();
}

describe("updateProfileAction (SEC-MYPAGE-02)", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockClear();
    mockGetSession.mockClear();
    mockUpdateCustomerProfileByUserId.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();

    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockUpdateCustomerProfileByUserId.mockImplementation(() =>
      Promise.resolve(),
    );
  });

  test("成功時に createAuditLogRecord が UPDATE + resource='customer' + customer.id で呼ばれる", async () => {
    const { updateProfileAction } =
      await import("@/app/(public)/mypage/_shared/actions/profile");

    await updateProfileAction(undefined, inputToFormData(VALID_PROFILE_INPUT));
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call.action).toBe("UPDATE");
    expect(call.resource).toBe("customer");
    expect(call.resourceId).toBe("customer-001");
    expect(call.userId).toBe("user-001");
    // newValue に profile 差分の要点が乗る
    expect(call.newValue).toEqual({
      customerType: "PERSONAL",
      lastName: "山田",
      firstName: "太郎",
      companyName: null,
      phoneNumber: "090-1234-5678",
      email: null,
    });
    // metadata に channel と operation が乗る
    const metadata =
      call.metadata && typeof call.metadata === "object"
        ? (call.metadata as Record<string, unknown>)
        : {};
    expect(metadata["channel"]).toBe("customer-mypage");
    expect(metadata["operation"]).toBe("customer_profile_updated");
  });

  test("認証失敗時は createAuditLogRecord が呼ばれない", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null));

    const { updateProfileAction } =
      await import("@/app/(public)/mypage/_shared/actions/profile");

    await updateProfileAction(undefined, inputToFormData(VALID_PROFILE_INPUT));
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });

  test("DB エラー時は createAuditLogRecord が呼ばれない (mutation 失敗経路)", async () => {
    mockUpdateCustomerProfileByUserId.mockImplementation(() =>
      Promise.reject(new Error("DB error")),
    );

    const { updateProfileAction } =
      await import("@/app/(public)/mypage/_shared/actions/profile");

    await updateProfileAction(undefined, inputToFormData(VALID_PROFILE_INPUT));
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});

describe("deleteAccountAction (SEC-MYPAGE-02)", () => {
  beforeEach(() => {
    mockCreateAuditLogRecord.mockClear();
    mockGetSession.mockClear();
    mockDeleteUser.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();

    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockDeleteUser.mockImplementation(() => Promise.resolve(undefined));
  });

  test("成功時に createAuditLogRecord が DELETE + resource='customer' で呼ばれる", async () => {
    const { deleteAccountAction } =
      await import("@/app/(public)/mypage/_shared/actions/account");

    await deleteAccountAction();
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
    const call = mockCreateAuditLogRecord.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("call is undefined");
    expect(call.action).toBe("DELETE");
    expect(call.resource).toBe("customer");
    expect(call.resourceId).toBe("customer-001");
    expect(call.userId).toBe("user-001");
    const metadata =
      call.metadata && typeof call.metadata === "object"
        ? (call.metadata as Record<string, unknown>)
        : {};
    expect(metadata["channel"]).toBe("customer-mypage");
    expect(metadata["operation"]).toBe("customer_account_delete_requested");
  });

  test("Better Auth deleteUser API 失敗時は createAuditLogRecord が呼ばれない", async () => {
    mockDeleteUser.mockImplementation(() =>
      Promise.reject(new Error("Better Auth error")),
    );

    const { deleteAccountAction } =
      await import("@/app/(public)/mypage/_shared/actions/account");

    await deleteAccountAction();
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });

  test("認証失敗時は createAuditLogRecord が呼ばれない", async () => {
    mockGetSession.mockImplementation(() => Promise.resolve(null));

    const { deleteAccountAction } =
      await import("@/app/(public)/mypage/_shared/actions/account");

    await deleteAccountAction();
    await flushMicrotasks();

    expect(mockCreateAuditLogRecord).not.toHaveBeenCalled();
  });
});
