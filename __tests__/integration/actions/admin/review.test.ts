/**
 * 管理レビュー Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/review.ts のテスト
 *
 * モック方針:
 * - executeAdminMutationResult: @/admin/lib/admin-action をモック（認証バイパス）
 * - toggleReviewPublishedCommand / deleteReviewCommand: domain コマンドをモック
 * - createValidationMutationError: action-helpers をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

// createValidationMutationError モック
mock.module("@/shared/lib/action-helpers", () => ({
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
  checkActionRateLimit: mock(() => Promise.resolve({ success: true })),
  validateTurnstile: mock(() => Promise.resolve({ success: true })),
}));

// executeAdminMutationResult モック（認証をバイパスし execute を直接呼び出す）
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mock(
    async (opts: {
      execute: () => Promise<unknown>;
      afterSuccess?: (data: unknown) => void;
    }) => {
      try {
        const data = await opts.execute();
        if (opts.afterSuccess) {
          opts.afterSuccess(data);
        }
        return { data };
      } catch (err) {
        if (err instanceof DomainError) {
          return { error: err.message };
        }
        throw err;
      }
    },
  ),
}));

// domain コマンドのモック
const mockToggleReviewPublishedCommand = mock(() =>
  Promise.resolve({ spaceId: "space-001" }),
);
const mockDeleteReviewCommand = mock(() =>
  Promise.resolve({ spaceId: "space-001" }),
);

mock.module("@/shared/domain/reviews/commands", () => ({
  toggleReviewPublishedCommand: mockToggleReviewPublishedCommand,
  deleteReviewCommand: mockDeleteReviewCommand,
  createReviewCommand: mock(() =>
    Promise.resolve({ id: "review-001", spaceId: "space-001" }),
  ),
}));

// next/cache モック
const mockUpdateTag = mock(() => undefined);

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
}));

// server-only モック
mock.module("server-only", () => ({}));

// =============================================================================
// テストデータ
// =============================================================================

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const INVALID_UUIDS = [
  "",
  "invalid",
  "12345",
  "not-a-uuid",
  "550e8400-e29b-41d4-a716", // 途中で切れている
  "550e8400e29b41d4a716446655440000", // ハイフンなし
];

// =============================================================================
// テスト本体
// =============================================================================

describe("toggleReviewVisibility", () => {
  beforeEach(() => {
    mockToggleReviewPublishedCommand.mockClear();
    mockUpdateTag.mockClear();
    mockToggleReviewPublishedCommand.mockImplementation(() =>
      Promise.resolve({ spaceId: "space-001" }),
    );
  });

  describe("正常系", () => {
    test("有効な UUID と isPublished=true で公開に変更できる", async () => {
      const { toggleReviewVisibility } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await toggleReviewVisibility(VALID_UUID, true);

      expect(result).not.toHaveProperty("error");
      expect(mockToggleReviewPublishedCommand).toHaveBeenCalledTimes(1);
      expect(mockToggleReviewPublishedCommand).toHaveBeenCalledWith(
        VALID_UUID,
        true,
      );
    });

    test("有効な UUID と isPublished=false で非公開に変更できる", async () => {
      const { toggleReviewVisibility } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await toggleReviewVisibility(VALID_UUID, false);

      expect(result).not.toHaveProperty("error");
      expect(mockToggleReviewPublishedCommand).toHaveBeenCalledWith(
        VALID_UUID,
        false,
      );
    });

    test("成功後に REVIEWS キャッシュが無効化される", async () => {
      const { toggleReviewVisibility } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await toggleReviewVisibility(VALID_UUID, true);

      const calledTags = (
        mockUpdateTag.mock.calls as unknown as [string][]
      ).map((c) => c[0]);
      expect(
        calledTags.some(
          (tag) => typeof tag === "string" && tag.includes("review"),
        ),
      ).toBe(true);
    });

    test("spaceId がある場合、スペース別レビューキャッシュも無効化される", async () => {
      mockToggleReviewPublishedCommand.mockImplementation(() =>
        Promise.resolve({ spaceId: "space-abc" }),
      );

      const { toggleReviewVisibility } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await toggleReviewVisibility(VALID_UUID, true);

      // REVIEWS + reviews.space(spaceId) + reviews.stats(spaceId) の 3 タグが無効化される
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test.each(INVALID_UUIDS)(
      "不正な UUID '%s' のとき fieldErrors を含むエラーを返す",
      async (invalidId) => {
        const { toggleReviewVisibility } =
          await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

        const result = await toggleReviewVisibility(invalidId, true);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("fieldErrors");
      },
    );

    test("バリデーション失敗時は toggleReviewPublishedCommand が呼ばれない", async () => {
      const { toggleReviewVisibility } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await toggleReviewVisibility("invalid-uuid", true);

      expect(mockToggleReviewPublishedCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("レビューが見つからない場合はエラーを返す", async () => {
      mockToggleReviewPublishedCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("レビューが見つかりません", "NOT_FOUND"),
        ),
      );

      const { toggleReviewVisibility } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await toggleReviewVisibility(VALID_UUID, true);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("レビューが見つかりません");
    });

    test("DomainError 以外のエラーは再スローされる", async () => {
      mockToggleReviewPublishedCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないDBエラー")),
      );

      const { toggleReviewVisibility } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await expect(toggleReviewVisibility(VALID_UUID, true)).rejects.toThrow(
        "予期しないDBエラー",
      );
    });
  });
});

describe("deleteReview", () => {
  beforeEach(() => {
    mockDeleteReviewCommand.mockClear();
    mockUpdateTag.mockClear();
    mockDeleteReviewCommand.mockImplementation(() =>
      Promise.resolve({ spaceId: "space-001" }),
    );
  });

  describe("正常系", () => {
    test("有効な UUID でレビューを削除できる", async () => {
      const { deleteReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await deleteReview(VALID_UUID);

      expect(result).not.toHaveProperty("error");
      expect(mockDeleteReviewCommand).toHaveBeenCalledTimes(1);
      expect(mockDeleteReviewCommand).toHaveBeenCalledWith(VALID_UUID);
    });

    test("成功後に REVIEWS キャッシュが無効化される", async () => {
      const { deleteReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await deleteReview(VALID_UUID);

      const calledTags = (
        mockUpdateTag.mock.calls as unknown as [string][]
      ).map((c) => c[0]);
      expect(
        calledTags.some(
          (tag) => typeof tag === "string" && tag.includes("review"),
        ),
      ).toBe(true);
    });

    test("spaceId がある場合、スペース別レビューキャッシュも無効化される", async () => {
      mockDeleteReviewCommand.mockImplementation(() =>
        Promise.resolve({ spaceId: "space-xyz" }),
      );

      const { deleteReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await deleteReview(VALID_UUID);

      // REVIEWS + reviews.space(spaceId) + reviews.stats(spaceId) の 3 タグが無効化される
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test.each(INVALID_UUIDS)(
      "不正な UUID '%s' のとき fieldErrors を含むエラーを返す",
      async (invalidId) => {
        const { deleteReview } =
          await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

        const result = await deleteReview(invalidId);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("fieldErrors");
      },
    );

    test("バリデーション失敗時は deleteReviewCommand が呼ばれない", async () => {
      const { deleteReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await deleteReview("invalid-uuid");

      expect(mockDeleteReviewCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("レビューが見つからない場合はエラーを返す", async () => {
      mockDeleteReviewCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("レビューが見つかりません", "NOT_FOUND"),
        ),
      );

      const { deleteReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await deleteReview(VALID_UUID);

      expect(result).toHaveProperty("error");
      const errorResult = result as { error: string };
      expect(errorResult.error).toBe("レビューが見つかりません");
    });

    test("DomainError 以外のエラーは再スローされる", async () => {
      mockDeleteReviewCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないDBエラー")),
      );

      const { deleteReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await expect(deleteReview(VALID_UUID)).rejects.toThrow(
        "予期しないDBエラー",
      );
    });
  });
});

describe("idSchema バリデーション（単体）", () => {
  describe("正常系", () => {
    test("有効な UUID v4 で通過する", () => {
      const { z } = require("zod");
      const idSchema = z.string().uuid({ error: "レビューIDが不正です" });
      const result = idSchema.safeParse(VALID_UUID);
      expect(result.success).toBe(true);
    });

    test("異なる有効な UUID でも通過する", () => {
      const { z } = require("zod");
      const idSchema = z.string().uuid({ error: "レビューIDが不正です" });
      const anotherUuid = "123e4567-e89b-12d3-a456-426614174000";
      const result = idSchema.safeParse(anotherUuid);
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test.each(INVALID_UUIDS)(
      "不正な値 '%s' で失敗しエラーメッセージを含む",
      (invalidId) => {
        const { z } = require("zod");
        const idSchema = z.string().uuid({ error: "レビューIDが不正です" });
        const result = idSchema.safeParse(invalidId);
        expect(result.success).toBe(false);
        if (!result.success) {
          const hasExpectedError = result.error.issues.some(
            (issue: { message: string }) =>
              issue.message.includes("レビューIDが不正"),
          );
          expect(hasExpectedError).toBe(true);
        }
      },
    );
  });
});
