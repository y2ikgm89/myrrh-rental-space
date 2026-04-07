/**
 * 公開レビュー投稿 Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/review.ts のテスト
 *
 * モック方針:
 * - checkActionRateLimit: action-helpers をモック（常に成功を返す）
 * - createValidationMutationError: action-helpers をモック（ZodError → fieldErrors 変換）
 * - getSession: auth をモック（ログイン状態を制御）
 * - getCustomerByUserId: customers/queries をモック
 * - createReviewCommand: domain コマンドをモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

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

const mockGetSession = mock<
  () => Promise<{ user: { id: string; role: string; name: string } } | null>
>(() =>
  Promise.resolve({
    user: { id: "user-001", role: "CUSTOMER", name: "テストユーザー" },
  }),
);

mock.module("@/shared/lib/auth", () => ({
  getSession: mockGetSession,
  getCurrentUser: mock(() => Promise.resolve(null)),
  verifySession: mock(() => Promise.resolve(null)),
  verifyAdminSession: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  isAdmin: mock(() => Promise.resolve(false)),
  getSessionUser: () => null,
  getRoleFromSession: () => null,
  isValidRole: () => false,
  auth: {},
}));

const mockGetCustomerByUserId = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve({ id: "customer-001" }),
);

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

const mockCreateReviewCommand = mock(() =>
  Promise.resolve({
    id: "review-001",
    spaceId: "space-001",
  }),
);

mock.module("@/shared/domain/reviews/commands", () => ({
  createReviewCommand: mockCreateReviewCommand,
  toggleReviewPublishedCommand: mock(() =>
    Promise.resolve({ spaceId: "space-001" }),
  ),
  deleteReviewCommand: mock(() => Promise.resolve({ spaceId: "space-001" })),
}));

const mockUpdateTag = mock(() => undefined);

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
}));

// server-only モック（テスト環境で server-only を無効化）
mock.module("server-only", () => ({}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_RESERVATION_ID = "00000000-0000-4000-a000-000000000001";

const VALID_INPUT = {
  reservationId: VALID_RESERVATION_ID,
  rating: 4,
  title: "素晴らしいスペースでした",
  comment: "清潔感があり、スタッフも親切でした。また利用したいです。",
  turnstileToken: "test-turnstile-token",
};

// =============================================================================
// テスト本体
// =============================================================================

describe("submitReview", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockClear();
    mockGetSession.mockClear();
    mockGetCustomerByUserId.mockClear();
    mockCreateReviewCommand.mockClear();
    mockUpdateTag.mockClear();
    // 成功レスポンスにリセット
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", role: "CUSTOMER", name: "テストユーザー" },
      }),
    );
    mockGetCustomerByUserId.mockImplementation(() =>
      Promise.resolve({ id: "customer-001" }),
    );
    mockCreateReviewCommand.mockImplementation(() =>
      Promise.resolve({
        id: "review-001",
        spaceId: "space-001",
      }),
    );
  });

  describe("正常系", () => {
    test("有効な入力でレビュー作成が成功し id を返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toEqual({ id: "review-001" });
    });

    test("createReviewCommand が customerId / reservationId / rating / title / comment を引数に呼ばれる", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(VALID_INPUT);

      expect(mockCreateReviewCommand).toHaveBeenCalledTimes(1);
      expect(mockCreateReviewCommand).toHaveBeenCalledWith({
        customerId: "customer-001",
        reservationId: VALID_RESERVATION_ID,
        rating: 4,
        title: "素晴らしいスペースでした",
        comment: "清潔感があり、スタッフも親切でした。また利用したいです。",
      });
    });

    test("updateTag がキャッシュ無効化のために複数回呼ばれる", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(VALID_INPUT);

      // REVIEWS + reviews.space(spaceId) + reviews.stats(spaceId) + CUSTOMERS + customers.detail(customerId) = 5回
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(5);
    });

    test("title と comment が省略されても成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const inputWithoutOptional = {
        reservationId: VALID_RESERVATION_ID,
        rating: 5,
        turnstileToken: "test-turnstile-token",
      };
      const result = await submitReview(inputWithoutOptional);

      expect(result).toEqual({ id: "review-001" });
    });

    test("title と comment が空文字列でも成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({
        ...VALID_INPUT,
        title: "",
        comment: "",
      });

      expect(result).toEqual({ id: "review-001" });
    });

    test("rating が最小値 1 で成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({ ...VALID_INPUT, rating: 1 });

      expect(result).toEqual({ id: "review-001" });
    });

    test("rating が最大値 5 で成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({ ...VALID_INPUT, rating: 5 });

      expect(result).toEqual({ id: "review-001" });
    });
  });

  describe("異常系: レート制限", () => {
    test("レート制限超過時はエラーを返す", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error:
            "リクエストが多すぎます。しばらく経ってから再度お試しください。",
        }),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toHaveProperty("error");
    });

    test("レート制限超過時は createReviewCommand が呼ばれない", async () => {
      mockCheckActionRateLimit.mockImplementation(() =>
        Promise.resolve({
          success: false as const,
          error: "レート制限超過",
        }),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(VALID_INPUT);

      expect(mockCreateReviewCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("reservationId が無効な UUID のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({
        ...VALID_INPUT,
        reservationId: "not-a-uuid",
      });

      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("fieldErrors");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("reservationId");
    });

    test("rating が 0 のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({ ...VALID_INPUT, rating: 0 });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("rating");
    });

    test("rating が 6 のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({ ...VALID_INPUT, rating: 6 });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("rating");
    });

    test("title が 101 文字のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({
        ...VALID_INPUT,
        title: "あ".repeat(101),
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("title");
    });

    test("comment が 1001 文字のとき fieldErrors を含むエラーを返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview({
        ...VALID_INPUT,
        comment: "あ".repeat(1001),
      });

      expect(result).toHaveProperty("error");
      const errorResult = result as {
        error: string;
        fieldErrors: Record<string, string[]>;
      };
      expect(errorResult.fieldErrors).toHaveProperty("comment");
    });

    test("バリデーション失敗時は createReviewCommand が呼ばれない", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview({ ...VALID_INPUT, rating: 0 });

      expect(mockCreateReviewCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: 未認証", () => {
    test("未ログイン時はエラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("ログインが必要です");
    });

    test("未ログイン時は createReviewCommand が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(VALID_INPUT);

      expect(mockCreateReviewCommand).not.toHaveBeenCalled();
    });

    test("顧客情報が見つからない場合はエラーを返す", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("顧客情報が見つかりません");
    });
  });

  describe("異常系: DomainError", () => {
    test("DomainError（NOT_FOUND）をスローしたとき MutationError を返す", async () => {
      mockCreateReviewCommand.mockImplementation(() =>
        Promise.reject(new DomainError("予約が見つかりません", "NOT_FOUND")),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("予約が見つかりません");
    });

    test("DomainError（UNAUTHORIZED）をスローしたとき MutationError を返す", async () => {
      mockCreateReviewCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError(
            "この予約にレビューを投稿する権限がありません",
            "UNAUTHORIZED",
          ),
        ),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe(
        "この予約にレビューを投稿する権限がありません",
      );
    });

    test("DomainError（VALIDATION）をスローしたとき MutationError を返す", async () => {
      mockCreateReviewCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError(
            "完了済みの予約のみレビューを投稿できます",
            "VALIDATION",
          ),
        ),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe(
        "完了済みの予約のみレビューを投稿できます",
      );
    });

    test("DomainError（CONFLICT）をスローしたとき MutationError を返す", async () => {
      mockCreateReviewCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError(
            "この予約には既にレビューが投稿されています",
            "CONFLICT",
          ),
        ),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(VALID_INPUT);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe(
        "この予約には既にレビューが投稿されています",
      );
    });

    test("DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCreateReviewCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないDBエラー")),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await expect(submitReview(VALID_INPUT)).rejects.toThrow(
        "予期しないDBエラー",
      );
    });
  });

  describe("spaceReviewSchema バリデーション（単体）", () => {
    test("有効な最小データで通過", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        reservationId: VALID_RESERVATION_ID,
        rating: 3,
        turnstileToken: "test-token",
      });

      expect(result.success).toBe(true);
    });

    test("title と comment は省略可能", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        reservationId: VALID_RESERVATION_ID,
        rating: 5,
        turnstileToken: "test-token",
      });

      expect(result.success).toBe(true);
    });

    test("title が 100 文字以内で通過", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        ...VALID_INPUT,
        title: "あ".repeat(100),
      });

      expect(result.success).toBe(true);
    });

    test("comment が 1000 文字以内で通過", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        ...VALID_INPUT,
        comment: "あ".repeat(1000),
      });

      expect(result.success).toBe(true);
    });

    test("rating が 1 の境界値で通過", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        ...VALID_INPUT,
        rating: 1,
      });

      expect(result.success).toBe(true);
    });

    test("rating が 5 の境界値で通過", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        ...VALID_INPUT,
        rating: 5,
      });

      expect(result.success).toBe(true);
    });

    test("rating が小数点のとき失敗", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        ...VALID_INPUT,
        rating: 3.5,
      });

      expect(result.success).toBe(false);
    });

    test("reservationId が未入力のとき失敗", async () => {
      const { spaceReviewSchema } =
        await import("@/shared/lib/validations/review");

      const result = spaceReviewSchema.safeParse({
        rating: 3,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const reservationIdError = result.error.issues.find(
          (issue) => issue.path[0] === "reservationId",
        );
        expect(reservationIdError).toBeDefined();
      }
    });
  });
});
