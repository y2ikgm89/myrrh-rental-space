/**
 * マイページ プロフィール Server Action 統合テスト
 *
 * src/app/(public)/mypage/_shared/actions/profile.ts のテスト
 *
 * Phase 2 conform 移行後:
 *   signature: `(_prev: SubmissionResult | undefined, formData: FormData) => Promise<SubmissionResult>`
 *   - `executeConformMutation(formData, schema, handler, { resetForm: false })` 経由
 *   - success: `submission.reply()` → `{ status: "success", initialValue, ... }`
 *     (submitted values 維持で profile UX を保持)
 *   - field-level error: `submission.reply()` で field-level errors
 *   - form-level error (rate limit / auth / Turnstile / DB error): `reply({ formErrors })`
 *
 * テスト対象:
 * - updateProfileAction: プロフィール更新
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectSubmissionLike } from "../../../helpers/type-assertions";

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
}));

// domain コマンドモック
const mockUpdateCustomerProfileByUserId = mock((): Promise<void> =>
  Promise.resolve(),
);

mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerProfileByUserId: mockUpdateCustomerProfileByUserId,
}));

// customer query mock
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

type ProfileInputShape = {
  customerType?: "PERSONAL" | "CORPORATE";
  lastName: string;
  firstName: string;
  companyName?: string;
  phoneNumber?: string;
  turnstileToken?: string;
};

const VALID_INPUT: ProfileInputShape = {
  customerType: "PERSONAL",
  lastName: "山田",
  firstName: "太郎",
  phoneNumber: "090-1234-5678",
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
  if (input.turnstileToken !== undefined) {
    fd.append("turnstileToken", input.turnstileToken);
  }
  return fd;
}

// =============================================================================
// テスト本体
// =============================================================================

describe("updateProfileAction", () => {
  beforeEach(() => {
    mockGetSession.mockClear();
    mockUpdateCustomerProfileByUserId.mockClear();
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();
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
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockUpdateCustomerProfileByUserId.mockImplementation(() =>
      Promise.resolve(),
    );
  });

  describe("正常系", () => {
    test("有効な入力でプロフィール更新が成功する (status: success)", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      // resetForm: false 指定で `reply()` は `{ status: "success", initialValue, ... }`
      // を返す (initialValue !== null で submitted values 維持)
      expect(result.status).toBe("success");
      expect(result.initialValue).not.toBeNull();
    });

    test("updateCustomerProfileByUserId が userId とパースデータを引数に呼ばれる", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(undefined, inputToFormData(VALID_INPUT));

      expect(mockUpdateCustomerProfileByUserId).toHaveBeenCalledTimes(1);
      expect(mockUpdateCustomerProfileByUserId).toHaveBeenCalledWith(
        "user-001",
        {
          customerType: "PERSONAL",
          lastName: "山田",
          firstName: "太郎",
          companyName: null,
          phoneNumber: "090-1234-5678",
        },
      );
    });

    test("updateTag が CUSTOMERS + customers.detail(id) キャッシュタグで呼ばれる", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(undefined, inputToFormData(VALID_INPUT));

      // CACHE_TAGS.CUSTOMERS + getCacheTag.customers.detail(id) の 2 回呼ばれる
      expect(mockUpdateTag).toHaveBeenCalledTimes(2);
      expect(mockUpdateTag).toHaveBeenCalledWith("customers");
    });

    test("phoneNumber が省略されても成功する", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData({
          lastName: "田中",
          firstName: "花子",
        }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("success");
    });

    test("phoneNumber が空文字列のとき null として渡される", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(
        undefined,
        inputToFormData({ ...VALID_INPUT, phoneNumber: "" }),
      );

      expect(mockUpdateCustomerProfileByUserId).toHaveBeenCalledWith(
        "user-001",
        {
          customerType: "PERSONAL",
          lastName: "山田",
          firstName: "太郎",
          companyName: null,
          phoneNumber: null,
        },
      );
    });
  });

  describe("異常系: 未認証", () => {
    test("セッションが null のとき formErrors に認証エラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("認証が必要です");
    });

    test("未認証時は updateCustomerProfileByUserId が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(undefined, inputToFormData(VALID_INPUT));

      expect(mockUpdateCustomerProfileByUserId).not.toHaveBeenCalled();
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時は formErrors にエラーを返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "リクエストが多すぎます",
        }),
      );

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("リクエストが多すぎます");
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

      await updateProfileAction(undefined, inputToFormData(VALID_INPUT));

      expect(mockUpdateCustomerProfileByUserId).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("lastName が空文字列のとき fieldErrors を返す", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData({ ...VALID_INPUT, lastName: "" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["lastName"]).toBeDefined();
    });

    test("firstName が空文字列のとき fieldErrors を返す", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData({ ...VALID_INPUT, firstName: "" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["firstName"]).toBeDefined();
    });

    test("phoneNumber が 21 文字以上のとき fieldErrors を返す", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData({ ...VALID_INPUT, phoneNumber: "0".repeat(21) }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["phoneNumber"]).toBeDefined();
    });

    test("バリデーション失敗時は updateCustomerProfileByUserId が呼ばれない", async () => {
      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(
        undefined,
        inputToFormData({ ...VALID_INPUT, lastName: "" }),
      );

      expect(mockUpdateCustomerProfileByUserId).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DB エラー", () => {
    test("updateCustomerProfileByUserId がエラーをスローした場合 formErrors を返す", async () => {
      mockUpdateCustomerProfileByUserId.mockImplementation(() =>
        Promise.reject(new Error("DB 接続エラー")),
      );

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      const result = await updateProfileAction(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("プロフィールの更新に失敗しました");
    });

    test("DB エラー時は updateTag が呼ばれない", async () => {
      mockUpdateCustomerProfileByUserId.mockImplementation(() =>
        Promise.reject(new Error("DB 接続エラー")),
      );

      const { updateProfileAction } =
        await import("@/app/(public)/mypage/_shared/actions/profile");

      await updateProfileAction(undefined, inputToFormData(VALID_INPUT));

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
        lastName: "山田",
        firstName: "太郎",
        phoneNumber: "0".repeat(20),
      });

      expect(result.success).toBe(true);
    });

    test("phoneNumber が 21 文字で失敗", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        lastName: "山田",
        firstName: "太郎",
        phoneNumber: "0".repeat(21),
      });

      expect(result.success).toBe(false);
    });

    test("lastName が空文字列で失敗", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        lastName: "",
        firstName: "太郎",
      });

      expect(result.success).toBe(false);
    });

    test("firstName が空文字列で失敗", async () => {
      const { customerProfileSchema } =
        await import("@/shared/lib/validations/customer-profile");

      const result = customerProfileSchema.safeParse({
        lastName: "山田",
        firstName: "",
      });

      expect(result.success).toBe(false);
    });
  });
});
