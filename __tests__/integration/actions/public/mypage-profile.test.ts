/**
 * マイページ プロフィール Server Action 統合テスト
 *
 * src/app/(public)/mypage/_shared/actions/profile.ts のテスト
 *
 * テスト対象:
 * - updateProfileAction: プロフィール更新
 *
 * モック方針:
 * - getSession: auth をモック（認証状態を制御）
 * - updateCustomerProfileByUserId: domain コマンドをモック
 * - checkActionRateLimit: action-helpers をモック
 * - updateTag: next/cache をモック
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
const mockUpdateTag = mock(() => undefined);

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
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

// domain コマンドモック
const mockUpdateCustomerProfileByUserId = mock(
  (): Promise<void> => Promise.resolve(),
);

mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerProfileByUserId: mockUpdateCustomerProfileByUserId,
}));

// customer query mock（updateProfile は getCustomerByUserId でキャッシュタグ customerId を取得）
const mockGetCustomerByUserId = mock(() =>
  Promise.resolve({ id: "customer-001" }),
);

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

// auth モック
const mockGetSession = mock(
  (): Promise<{ user: { id: string; name: string } } | null> =>
    Promise.resolve({
      user: { id: "user-001", name: "テストユーザー" },
    }),
);

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetSession,
  customerAuth: { api: {} },
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

// @/shared/lib/constants はモック不要（純粋な定数ファイル、副作用なし）

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
}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_INPUT = {
  lastName: "山田",
  firstName: "太郎",
  phoneNumber: "090-1234-5678",
};

// =============================================================================
// テスト本体
// =============================================================================

describe("updateProfileAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockUpdateCustomerProfileByUserId.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockUpdateTag.mockClear();

    // デフォルト: 認証済み + レート制限なし + 更新成功
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", name: "テストユーザー" },
      }),
    );
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockUpdateCustomerProfileByUserId.mockImplementation(() =>
      Promise.resolve(),
    );
  });

  describe("正常系", () => {
    test("有効な入力でプロフィール更新が成功し null を返す", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(VALID_INPUT);

      expect(result).toBeNull();
    });

    test("updateCustomerProfileByUserId が userId とパースデータを引数に呼ばれる", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(VALID_INPUT);

      expect(mockUpdateCustomerProfileByUserId).toHaveBeenCalledTimes(1);
      expect(mockUpdateCustomerProfileByUserId).toHaveBeenCalledWith(
        "user-001",
        {
          lastName: "山田",
          firstName: "太郎",
          phoneNumber: "090-1234-5678",
        },
      );
    });

    test("updateTag が CUSTOMERS + customers.detail(id) キャッシュタグで呼ばれる", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(VALID_INPUT);

      // CACHE_TAGS.CUSTOMERS + getCacheTag.customers.detail(id) の 2 回呼ばれる
      expect(mockUpdateTag).toHaveBeenCalledTimes(2);
      expect(mockUpdateTag).toHaveBeenCalledWith("customers");
    });

    test("phoneNumber が省略されても成功する", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction({
        lastName: "田中",
        firstName: "花子",
      });

      expect(result).toBeNull();
    });

    test("phoneNumber が空文字列でも成功する", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction({
        ...VALID_INPUT,
        phoneNumber: "",
      });

      expect(result).toBeNull();
    });

    test("phoneNumber が空文字列のとき null として渡される", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction({
        ...VALID_INPUT,
        phoneNumber: "",
      });

      expect(mockUpdateCustomerProfileByUserId).toHaveBeenCalledWith(
        "user-001",
        {
          lastName: "山田",
          firstName: "太郎",
          phoneNumber: null,
        },
      );
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("認証が必要です");
    });

    test("未認証時は updateCustomerProfileByUserId が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(VALID_INPUT);

      expect(mockUpdateCustomerProfileByUserId).not.toHaveBeenCalled();
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

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("リクエストが多すぎます");
    });

    test("レート制限超過時は updateCustomerProfileByUserId が呼ばれない", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(VALID_INPUT);

      expect(mockUpdateCustomerProfileByUserId).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("lastName が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction({
        ...VALID_INPUT,
        lastName: "",
      });

      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("fieldErrors");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("lastName");
    });

    test("firstName が空文字列のとき fieldErrors を含むエラーを返す", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction({
        ...VALID_INPUT,
        firstName: "",
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("firstName");
    });

    test("phoneNumber が 21 文字以上のとき fieldErrors を含むエラーを返す", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction({
        ...VALID_INPUT,
        phoneNumber: "0".repeat(21),
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("phoneNumber");
    });

    test("バリデーション失敗時は updateCustomerProfileByUserId が呼ばれない", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction({ ...VALID_INPUT, lastName: "" });

      expect(mockUpdateCustomerProfileByUserId).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DB エラー", () => {
    test("updateCustomerProfileByUserId がエラーをスローした場合 MutationError を返す", async () => {
      mockUpdateCustomerProfileByUserId.mockImplementation(() =>
        Promise.reject(new Error("DB 接続エラー")),
      );

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("プロフィールの更新に失敗しました");
    });

    test("DB エラー時は updateTag が呼ばれない", async () => {
      mockUpdateCustomerProfileByUserId.mockImplementation(() =>
        Promise.reject(new Error("DB 接続エラー")),
      );

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(VALID_INPUT);

      expect(mockUpdateTag).not.toHaveBeenCalled();
    });
  });

  describe("customerProfileSchema バリデーション（単体）", () => {
    test("有効な最小データで通過", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        lastName: "田中",
        firstName: "花子",
      });

      expect(result.success).toBe(true);
    });

    test("phoneNumber は省略可能", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        lastName: "田中",
        firstName: "花子",
        // phoneNumber なし
      });

      expect(result.success).toBe(true);
    });

    test("phoneNumber が空文字列でも通過", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        lastName: "田中",
        firstName: "花子",
        phoneNumber: "",
      });

      expect(result.success).toBe(true);
    });

    test("phoneNumber が 20 文字の境界値で通過", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        ...VALID_INPUT,
        phoneNumber: "0".repeat(20),
      });

      expect(result.success).toBe(true);
    });

    test("phoneNumber が 21 文字で失敗", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        ...VALID_INPUT,
        phoneNumber: "0".repeat(21),
      });

      expect(result.success).toBe(false);
    });

    test("lastName が空文字列で失敗", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        ...VALID_INPUT,
        lastName: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const lastNameError = result.error.issues.find(
          (issue) => issue.path[0] === "lastName",
        );
        expect(lastNameError).toBeDefined();
      }
    });

    test("firstName が空文字列で失敗", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        ...VALID_INPUT,
        firstName: "",
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const firstNameError = result.error.issues.find(
          (issue) => issue.path[0] === "firstName",
        );
        expect(firstNameError).toBeDefined();
      }
    });
  });
});
