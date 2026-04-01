/**
 * マイページ アカウント Server Action 統合テスト
 *
 * src/app/(public)/mypage/_shared/actions/account.ts のテスト
 *
 * テスト対象:
 * - getAccountLinksAction: アカウントプロバイダー一覧取得
 * - deleteAccountAction: アカウント削除
 *
 * モック方針:
 * - getSession: auth をモック（認証状態を制御）
 * - getAccountProviders: domain クエリをモック
 * - auth.api.deleteUser: Better Auth API をモック
 * - checkActionRateLimit: action-helpers をモック
 * - headers: next/headers をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

// server-only モック
mock.module("server-only", () => ({}));

// next/headers モック
mock.module("next/headers", () => ({
  headers: mock(() => new Headers()),
}));

// next/cache モック
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

// レート制限モック
const mockCheckActionRateLimit = mock(
  (): Promise<{ success: boolean; error?: string }> =>
    Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
  validateTurnstile: mock(() => Promise.resolve({ success: true })),
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
  publicQueryRateLimiter: {},
}));

// domain クエリモック
const mockGetAccountProviders = mock(
  (): Promise<string[]> => Promise.resolve(["google", "line"]),
);

mock.module("@/shared/domain/users/queries", () => ({
  getAccountProviders: mockGetAccountProviders,
}));

// auth モック
const mockDeleteUser = mock(() => Promise.resolve(undefined));
const mockGetSession = mock(
  (): Promise<{ user: { id: string; name: string } } | null> =>
    Promise.resolve({
      user: { id: "user-001", name: "テストユーザー" },
    }),
);

mock.module("@/shared/lib/auth", () => ({
  getSession: mockGetSession,
  auth: {
    api: {
      deleteUser: mockDeleteUser,
    },
  },
  getCurrentUser: mock(() => Promise.resolve(null)),
  verifySession: mock(() => Promise.resolve(null)),
  verifyAdminSession: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  isAdmin: mock(() => Promise.resolve(false)),
  getSessionUser: () => null,
  getRoleFromSession: () => null,
  isValidRole: () => false,
}));

// エラーロギングモック
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
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

// =============================================================================
// テスト本体
// =============================================================================

describe("getAccountLinksAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockGetAccountProviders.mockClear();
    mockCheckActionRateLimit.mockClear();

    // デフォルト: 認証済み + レート制限なし
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetAccountProviders.mockImplementation(() =>
      Promise.resolve(["google", "line"]),
    );
  });

  describe("正常系", () => {
    test("認証済みユーザーがアカウントプロバイダー一覧を取得できる", async () => {
      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await getAccountLinksAction();

      expect(result).toEqual({ accounts: ["google", "line"] });
    });

    test("getAccountProviders が session.user.id を引数に呼ばれる", async () => {
      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await getAccountLinksAction();

      expect(mockGetAccountProviders).toHaveBeenCalledTimes(1);
      expect(mockGetAccountProviders).toHaveBeenCalledWith("user-001");
    });

    test("プロバイダーが空配列の場合は空配列を返す", async () => {
      mockGetAccountProviders.mockImplementation(() => Promise.resolve([]));

      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await getAccountLinksAction();

      expect(result).toEqual({ accounts: [] });
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await getAccountLinksAction();

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("認証が必要です");
    });

    test("未認証時は getAccountProviders が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await getAccountLinksAction();

      expect(mockGetAccountProviders).not.toHaveBeenCalled();
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時はエラーを返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await getAccountLinksAction();

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("リクエストが多すぎます");
    });

    test("レート制限超過時は getSession が呼ばれない", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await getAccountLinksAction();

      expect(mockGetSession).not.toHaveBeenCalled();
    });
  });
});

describe("deleteAccountAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockDeleteUser.mockClear();
    mockCheckActionRateLimit.mockClear();

    // デフォルト: 認証済み + レート制限なし
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockDeleteUser.mockImplementation(() => Promise.resolve(undefined));
  });

  describe("正常系", () => {
    test("認証済みユーザーがアカウントを削除できる", async () => {
      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await deleteAccountAction();

      expect(result).toBeNull();
    });

    test("auth.api.deleteUser が headers を引数に呼ばれる", async () => {
      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await deleteAccountAction();

      expect(mockDeleteUser).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await deleteAccountAction();

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("認証が必要です");
    });

    test("未認証時は auth.api.deleteUser が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await deleteAccountAction();

      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時はエラーを返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await deleteAccountAction();

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("リクエストが多すぎます");
    });
  });

  describe("異常系: deleteUser 失敗", () => {
    test("auth.api.deleteUser がエラーをスローした場合 MutationError を返す", async () => {
      mockDeleteUser.mockImplementation(() =>
        Promise.reject(new Error("削除に失敗しました")),
      );

      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await deleteAccountAction();

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("アカウントの削除に失敗しました");
    });
  });
});
