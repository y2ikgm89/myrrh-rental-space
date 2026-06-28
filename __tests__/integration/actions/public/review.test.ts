/**
 * 公開レビュー投稿 Server Action 統合テスト
 *
 * src/app/(public)/_shared/actions/review.ts のテスト
 *
 * Phase 2 conform 移行後:
 *   signature: `(_prev: SubmissionResult | undefined, formData: FormData) => Promise<SubmissionResult>`
 *   - `executeConformMutation(formData, spaceReviewSchema, handler)` 経由 (default `resetForm: true`)
 *   - success: `submission.reply({ resetForm: true })` → `{ initialValue: null }`
 *   - field-level error: `submission.reply()` で field-level errors
 *   - form-level error (rate limit / auth / Turnstile / DomainError): `reply({ formErrors })`
 *
 * モック方針:
 * - checkActionRateLimit: action-helpers をモック (常に成功を返す)
 * - getCustomerSession: auth をモック (ログイン状態を制御)
 * - getCustomerByUserId: customers/queries をモック
 * - createReviewCommand: domain コマンドをモック
 * - invalidateReviewCaches: cache helper をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectSubmissionLike } from "../../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

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

const mockGetSession = mock<
  () => Promise<{ user: { id: string; role: string; name: string } } | null>
>(() =>
  Promise.resolve({
    user: { id: "user-001", role: "CUSTOMER", name: "テストユーザー" },
  }),
);

mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetSession,
  getCurrentCustomerUser: mock(() => Promise.resolve(null)),
  verifyCustomerSession: mock(() => Promise.resolve(null)),
  getCustomerSessionUser: () => null,
  isValidRole: () => false,
  customerAuth: {},
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

const mockGetCustomerByUserId = mock<
  () => Promise<{
    id: string;
    lastName: string;
    firstName: string;
  } | null>
>(() =>
  Promise.resolve({
    id: "customer-001",
    lastName: "山田",
    firstName: "太郎",
  }),
);

mock.module("@/shared/domain/customers/queries", () => ({
  getCustomerByUserId: mockGetCustomerByUserId,
}));

const mockCreateReviewCommand = mock(() =>
  Promise.resolve({
    id: "review-001",
    spaceId: "space-001",
    spaceSlug: "test-space",
  }),
);

mock.module("@/shared/domain/reviews/commands", () => ({
  createReviewCommand: mockCreateReviewCommand,
  updateReviewPublishedCommand: mock(() =>
    Promise.resolve({ spaceId: "space-001" }),
  ),
  deleteReviewCommand: mock(() => Promise.resolve({ spaceId: "space-001" })),
}));

const mockInvalidateReviewCaches = mock(() => undefined);

mock.module("@/shared/lib/cache/review-cache", () => ({
  invalidateReviewCaches: mockInvalidateReviewCaches,
}));

const mockUpdateTag = mock(() => undefined);

// 公式 Bun re-export pattern: actual を spread して必要 fn のみ override。
// partial mock は cacheTag/cacheLife/revalidateTag 等を undefined 化し、
// 'use cache' 経路を引く domain query (getSuppressedEmailSet 等) を SyntaxError 化する。
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: mockUpdateTag,
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  },
  settleAllWithLogging: <T>(promises: Promise<T>[]) =>
    Promise.allSettled(promises),
  withTimeout: <T>(promise: Promise<T>) => promise,
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}));

// server-only モック
mock.module("server-only", () => ({}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_RESERVATION_ID = "00000000-0000-4000-a000-000000000001";

type ReviewInputShape = {
  reservationId: string;
  rating: number;
  title?: string;
  comment?: string;
  turnstileToken: string;
};

const VALID_INPUT: ReviewInputShape = {
  reservationId: VALID_RESERVATION_ID,
  rating: 4,
  title: "素晴らしいスペースでした",
  comment: "清潔感があり、スタッフも親切でした。また利用したいです。",
  turnstileToken: "test-turnstile-token",
};

function inputToFormData(input: ReviewInputShape): FormData {
  const fd = new FormData();
  fd.append("reservationId", input.reservationId);
  fd.append("rating", String(input.rating));
  if (input.title !== undefined) {
    fd.append("title", input.title);
  }
  if (input.comment !== undefined) {
    fd.append("comment", input.comment);
  }
  fd.append("turnstileToken", input.turnstileToken);
  return fd;
}

// =============================================================================
// テスト本体
// =============================================================================

describe("submitReview", () => {
  beforeEach(() => {
    mockCheckActionRateLimit.mockClear();
    mockValidateTurnstile.mockClear();
    mockGetSession.mockClear();
    mockGetCustomerByUserId.mockClear();
    mockCreateReviewCommand.mockClear();
    mockInvalidateReviewCaches.mockClear();
    mockUpdateTag.mockClear();
    // 成功レスポンスにリセット
    mockCheckActionRateLimit.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockValidateTurnstile.mockImplementation(() =>
      Promise.resolve({ success: true as const }),
    );
    mockGetSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", role: "CUSTOMER", name: "テストユーザー" },
      }),
    );
    mockGetCustomerByUserId.mockImplementation(() =>
      Promise.resolve({
        id: "customer-001",
        lastName: "山田",
        firstName: "太郎",
      }),
    );
    mockCreateReviewCommand.mockImplementation(() =>
      Promise.resolve({
        id: "review-001",
        spaceId: "space-001",
        spaceSlug: "test-space",
      }),
    );
  });

  describe("正常系", () => {
    test("有効な入力でレビュー作成が成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      // conform v1.19: `reply({ resetForm: true })` は `{ initialValue: null }`
      expect(result.initialValue).toBeNull();
      expect(result.status).not.toBe("error");
    });

    test("createReviewCommand が customerId / reservationId / rating / title / comment を引数に呼ばれる", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreateReviewCommand).toHaveBeenCalledTimes(1);
      expect(mockCreateReviewCommand).toHaveBeenCalledWith({
        customerId: "customer-001",
        reservationId: VALID_RESERVATION_ID,
        rating: 4,
        title: "素晴らしいスペースでした",
        comment: "清潔感があり、スタッフも親切でした。また利用したいです。",
      });
    });

    test("invalidateReviewCaches がキャッシュ無効化のために呼ばれる", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(undefined, inputToFormData(VALID_INPUT));

      expect(mockInvalidateReviewCaches).toHaveBeenCalledTimes(1);
      expect(mockInvalidateReviewCaches).toHaveBeenCalledWith(
        "space-001",
        "test-space",
        { customerId: "customer-001" },
      );
    });

    test("title と comment が省略されても成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({
          reservationId: VALID_RESERVATION_ID,
          rating: 5,
          turnstileToken: "test-turnstile-token",
        }),
      );
      expectSubmissionLike(result);

      expect(result.initialValue).toBeNull();
    });

    test("rating が最小値 1 で成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, rating: 1 }),
      );
      expectSubmissionLike(result);

      expect(result.initialValue).toBeNull();
    });

    test("rating が最大値 5 で成功する", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, rating: 5 }),
      );
      expectSubmissionLike(result);

      expect(result.initialValue).toBeNull();
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

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("リクエストが多すぎます");
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

      await submitReview(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreateReviewCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("reservationId が無効な UUID のとき fieldErrors を返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, reservationId: "not-a-uuid" }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["reservationId"]).toBeDefined();
    });

    test("rating が 0 のとき fieldErrors を返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, rating: 0 }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["rating"]).toBeDefined();
    });

    test("rating が 6 のとき fieldErrors を返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, rating: 6 }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["rating"]).toBeDefined();
    });

    test("title が 101 文字のとき fieldErrors を返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, title: "あ".repeat(101) }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["title"]).toBeDefined();
    });

    test("comment が 1001 文字のとき fieldErrors を返す", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, comment: "あ".repeat(1001) }),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.["comment"]).toBeDefined();
    });

    test("バリデーション失敗時は createReviewCommand が呼ばれない", async () => {
      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(
        undefined,
        inputToFormData({ ...VALID_INPUT, rating: 0 }),
      );

      expect(mockCreateReviewCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: 未認証", () => {
    test("未ログイン時は formErrors にエラーを返す", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("ログインが必要です");
    });

    test("未ログイン時は createReviewCommand が呼ばれない", async () => {
      mockGetSession.mockImplementation(() => Promise.resolve(null));

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await submitReview(undefined, inputToFormData(VALID_INPUT));

      expect(mockCreateReviewCommand).not.toHaveBeenCalled();
    });

    test("顧客情報が見つからない場合は formErrors にエラーを返す", async () => {
      mockGetCustomerByUserId.mockImplementation(() => Promise.resolve(null));

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("顧客情報が見つかりません");
    });
  });

  describe("異常系: DomainError", () => {
    test("DomainError (NOT_FOUND) をスローしたとき formErrors を返す", async () => {
      mockCreateReviewCommand.mockImplementation(() =>
        Promise.reject(new DomainError("予約が見つかりません", "NOT_FOUND")),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      const result = await submitReview(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe("予約が見つかりません");
    });

    test("DomainError (CONFLICT) をスローしたとき formErrors を返す", async () => {
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

      const result = await submitReview(
        undefined,
        inputToFormData(VALID_INPUT),
      );
      expectSubmissionLike(result);

      expect(result.status).toBe("error");
      expect(result.error?.[""]?.[0]).toBe(
        "この予約には既にレビューが投稿されています",
      );
    });

    test("DomainError 以外の Error をスローしたとき再スローされる", async () => {
      mockCreateReviewCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないDBエラー")),
      );

      const { submitReview } =
        await import("@/app/(public)/_shared/actions/review");

      await expect(
        submitReview(undefined, inputToFormData(VALID_INPUT)),
      ).rejects.toThrow("予期しないDBエラー");
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
        turnstileToken: "test-token",
      });

      expect(result.success).toBe(false);
    });
  });
});
