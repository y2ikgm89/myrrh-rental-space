/**
 * マイページ アカウント Server Action 統合テスト
 *
 * src/app/(public)/mypage/_shared/actions/account.ts のテスト
 *
 * テスト対象:
 * - getAccountLinksAction: アカウントプロバイダー一覧取得
 * - unlinkAccountAction: ソーシャル連携解除 (upstream revoke + DB unlink)
 * - deleteAccountAction: アカウント削除
 *
 * モック方針:
 * - getSession: auth をモック（認証状態を制御）
 * - getAccountProviders: domain クエリをモック
 * - auth.api.deleteUser / unlinkAccount / getAccessToken: Better Auth API をモック
 * - checkActionRateLimit: action-helpers をモック
 * - oauth-revoke: upstream revoke ヘルパーをモック
 * - headers: next/headers をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectErrorResult } from "../../../helpers/type-assertions";

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
  // SEC-MYPAGE-02: account.ts が buildAuditRequestContext 経由で必要とする
  // (rate-limit.ts から named export)。fireAndForget IIFE 内で使うため、テスト
  // での import 解決を通すためのスタブ (実際の呼出は fireAndForget 側で潰される)。
  getClientIpFromHeaders: mock(() => Promise.resolve("test-ip")),
}));

// domain クエリモック
const mockGetAccountProviders = mock((): Promise<string[]> =>
  Promise.resolve(["google", "line"]),
);

mock.module("@/shared/domain/users/queries", () => ({
  getAccountProviders: mockGetAccountProviders,
}));

// OAUTH-BETTER-AUTH-01: Server Action は getCustomerByUserId + assertCustomerActive
// を通ってから mutation を実行する。テストはドメインクエリ / ガードを両方 mock する。
const mockGetCustomerByUserId = mock(
  (): Promise<{ id: string; lastName: string; firstName: string } | null> =>
    Promise.resolve({
      id: "customer-001",
      lastName: "山田",
      firstName: "太郎",
    }),
);

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

const mockAssertCustomerActive = mock((): Promise<void> =>
  Promise.resolve(undefined),
);

mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mockAssertCustomerActive,
  ensureCustomerNotBlacklisted: mock(() => Promise.resolve(undefined)),
}));

// auth モック
const mockDeleteUser = mock(() => Promise.resolve(undefined));
const mockUnlinkAccountApi = mock(() => Promise.resolve(undefined));
const mockGetAccessToken = mock((): Promise<{ accessToken: string } | null> =>
  Promise.resolve({ accessToken: "test-access-token" }),
);
const mockGetSession = mock(
  (): Promise<{ user: { id: string; name: string } } | null> =>
    Promise.resolve({
      user: { id: "user-001", name: "テストユーザー" },
    }),
);

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetSession,
  customerAuth: {
    api: {
      deleteUser: mockDeleteUser,
      unlinkAccount: mockUnlinkAccountApi,
      getAccessToken: mockGetAccessToken,
    },
  },
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
}));

// upstream revoke ヘルパーモック
const mockRevokeOAuthGrantForProvider = mock((): Promise<void> =>
  Promise.resolve(undefined),
);

mock.module("@/shared/lib/oauth-revoke", () => ({
  revokeOAuthGrantForProvider: mockRevokeOAuthGrantForProvider,
  revokeGoogleOAuthGrant: mock(() => Promise.resolve(undefined)),
  revokeLineOAuthGrant: mock(() => Promise.resolve(undefined)),
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

// エラーロギングモック
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  // SEC-MYPAGE-02: fireAndForget (async-utils) が使う。
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

      expectErrorResult(result);
      expect(result.error).toBe("認証が必要です");
    });

    test("未認証時は getAccountProviders が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await getAccountLinksAction();

      expect(mockGetAccountProviders).not.toHaveBeenCalled();
    });
  });

  // SETTINGS-01: read query から write-form rate limit を撤去したため、
  // レート制限系のテストは廃止。cost gate は MypageAuthGate の redirect と
  // Better Auth session cookie の presence 検証で行う。
  describe("SETTINGS-01: rate-limit を消費しない", () => {
    test("getAccountLinksAction は checkActionRateLimit を呼ばない", async () => {
      const { getAccountLinksAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await getAccountLinksAction();

      expect(mockCheckActionRateLimit).not.toHaveBeenCalled();
    });
  });
});

describe("unlinkAccountAction (CRITIC-3)", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockUnlinkAccountApi.mockClear();
    mockGetAccessToken.mockClear();
    mockRevokeOAuthGrantForProvider.mockClear();

    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetAccessToken.mockImplementation(() =>
      Promise.resolve({ accessToken: "test-access-token" }),
    );
    mockUnlinkAccountApi.mockImplementation(() => Promise.resolve(undefined));
    mockRevokeOAuthGrantForProvider.mockImplementation(() =>
      Promise.resolve(undefined),
    );
  });

  describe("正常系: revoke + DB unlink の両方が実行される", () => {
    test("google 連携解除で upstream revoke → DB unlink が呼ばれる", async () => {
      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("google");

      expect(result).toBeNull();
      expect(mockRevokeOAuthGrantForProvider).toHaveBeenCalledTimes(1);
      expect(mockRevokeOAuthGrantForProvider).toHaveBeenCalledWith(
        "google",
        "test-access-token",
      );
      expect(mockUnlinkAccountApi).toHaveBeenCalledTimes(1);
      expect(mockUnlinkAccountApi).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { providerId: "google" },
        }),
      );
    });

    test("line 連携解除でも upstream revoke → DB unlink が呼ばれる", async () => {
      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("line");

      expect(result).toBeNull();
      expect(mockRevokeOAuthGrantForProvider).toHaveBeenCalledWith(
        "line",
        "test-access-token",
      );
    });

    test("upstream revoke が失敗しても DB unlink は続行する (best-effort)", async () => {
      mockRevokeOAuthGrantForProvider.mockImplementation(() =>
        Promise.reject(new Error("upstream 503")),
      );

      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("google");

      // upstream 失敗は握りつぶし、DB unlink は成功
      expect(result).toBeNull();
      expect(mockUnlinkAccountApi).toHaveBeenCalledTimes(1);
    });

    test("access token が取れなかった場合は revoke をスキップし DB unlink のみ実行", async () => {
      mockGetAccessToken.mockImplementation(() => Promise.resolve(null));

      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("google");

      expect(result).toBeNull();
      expect(mockRevokeOAuthGrantForProvider).not.toHaveBeenCalled();
      expect(mockUnlinkAccountApi).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("未認証時は認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("google");

      expectErrorResult(result);
      expect(result.error).toBe("認証が必要です");
      expect(mockUnlinkAccountApi).not.toHaveBeenCalled();
    });

    test("レート制限超過時はエラーを返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("google");

      expectErrorResult(result);
      expect(result.error).toBe("リクエストが多すぎます");
      expect(mockUnlinkAccountApi).not.toHaveBeenCalled();
    });

    test("未対応 provider は拒否する", async () => {
      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("facebook");

      expectErrorResult(result);
      expect(result.error).toBe("対応していない連携プロバイダーです");
      expect(mockUnlinkAccountApi).not.toHaveBeenCalled();
    });

    test("DB unlink が失敗した場合は MutationError を返す", async () => {
      mockUnlinkAccountApi.mockImplementation(() =>
        Promise.reject(new Error("last account cannot be unlinked")),
      );

      const { unlinkAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await unlinkAccountAction("google");

      expectErrorResult(result);
      expect(result.error).toBe("連携解除に失敗しました");
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
    test("認証済みユーザーがアカウント削除を申請できる（確認メール送信のみ、即時削除ではない）", async () => {
      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await deleteAccountAction();

      expect(result).toBeNull();
    });

    test("auth.api.deleteUser が headers と callbackURL を引数に呼ばれる", async () => {
      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      await deleteAccountAction();

      expect(mockDeleteUser).toHaveBeenCalledTimes(1);
      expect(mockDeleteUser).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { callbackURL: "/" },
        }),
      );
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { deleteAccountAction } =
        await import("@/app/(public)/mypage/_shared/actions/account");

      const result = await deleteAccountAction();

      expectErrorResult(result);
      expect(result.error).toBe("認証が必要です");
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

      expectErrorResult(result);
      expect(result.error).toBe("リクエストが多すぎます");
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

      expectErrorResult(result);
      expect(result.error).toBe("アカウント削除の受付に失敗しました");
    });
  });
});
