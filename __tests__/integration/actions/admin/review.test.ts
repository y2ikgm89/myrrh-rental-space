/**
 * 管理レビュー Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/review.ts のテスト
 *
 * モック方針:
 * - executeAdminMutationResult: @/admin/lib/admin-action をモック（認証バイパス）
 * - updateReviewPublishedCommand / deleteReviewCommand: domain コマンドをモック
 * - createValidationMutationError: action-helpers をモック
 * - updateTag: next/cache をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectErrorResult } from "../../../helpers/type-assertions";
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
const MOCK_ADMIN_USER = { id: "admin-user-001", email: "admin@example.com" };

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mock(
    async (opts: {
      execute: (user: typeof MOCK_ADMIN_USER) => Promise<unknown>;
      afterSuccess?: (data: unknown) => void;
    }) => {
      try {
        const data = await opts.execute(MOCK_ADMIN_USER);
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
const mockUpdateReviewPublishedCommand = mock(() =>
  Promise.resolve({ spaceId: "space-001" }),
);
const mockDeleteReviewCommand = mock(() =>
  Promise.resolve({ spaceId: "space-001" }),
);
type MockEmailContext = {
  customerEmail: string;
  customerName: string;
  spaceName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  replyBody: string;
};
type MockReplyResult = {
  spaceId: string;
  emailContext: MockEmailContext | null;
};
const DEFAULT_EMAIL_CONTEXT: MockEmailContext = {
  customerEmail: "test@example.com",
  customerName: "山田 太郎",
  spaceName: "Test Space",
  rating: 5,
  title: "素晴らしい",
  comment: "また使います",
  replyBody: "ありがとうございます",
};
const mockReplyToReviewCommand = mock<() => Promise<MockReplyResult>>(() =>
  Promise.resolve({
    spaceId: "space-001",
    emailContext: DEFAULT_EMAIL_CONTEXT,
  }),
);
const mockDeleteReviewReplyCommand = mock(() =>
  Promise.resolve({ spaceId: "space-001" }),
);

mock.module("@/shared/domain/reviews/commands", () => ({
  updateReviewPublishedCommand: mockUpdateReviewPublishedCommand,
  deleteReviewCommand: mockDeleteReviewCommand,
  replyToReviewCommand: mockReplyToReviewCommand,
  deleteReviewReplyCommand: mockDeleteReviewReplyCommand,
  createReviewCommand: mock(() =>
    Promise.resolve({ id: "review-001", spaceId: "space-001" }),
  ),
}));

// review-emails モック（fireAndForget 用）
const mockSendReviewReplyEmail = mock(() => Promise.resolve({ success: true }));
mock.module("@/shared/lib/email/review-emails", () => ({
  sendReviewReplyEmail: mockSendReviewReplyEmail,
}));

// next/cache モック
const mockUpdateTag = mock<(tag: string) => void>(() => undefined);

// 公式 Bun re-export pattern: actual を spread して必要 fn のみ override。
// partial mock は cacheTag/cacheLife/revalidateTag 等を undefined 化し、
// 'use cache' 経路を引く domain query (getSuppressedEmailSet 等) を SyntaxError 化する。
const actualNextCache = await import("next/cache");
mock.module("next/cache", () => ({
  ...actualNextCache,
  updateTag: mockUpdateTag,
}));

function getUpdatedTags(): string[] {
  return mockUpdateTag.mock.calls.map(([tag]) => tag);
}

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

describe("updateReviewPublished", () => {
  beforeEach(() => {
    mockUpdateReviewPublishedCommand.mockClear();
    mockUpdateTag.mockClear();
    mockUpdateReviewPublishedCommand.mockImplementation(() =>
      Promise.resolve({ spaceId: "space-001" }),
    );
  });

  describe("正常系", () => {
    test("有効な UUID と isPublished=true で公開に変更できる", async () => {
      const { updateReviewPublished } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await updateReviewPublished(VALID_UUID, true);

      expect(result).not.toHaveProperty("error");
      expect(mockUpdateReviewPublishedCommand).toHaveBeenCalledTimes(1);
      expect(mockUpdateReviewPublishedCommand).toHaveBeenCalledWith(
        VALID_UUID,
        true,
      );
    });

    test("有効な UUID と isPublished=false で非公開に変更できる", async () => {
      const { updateReviewPublished } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await updateReviewPublished(VALID_UUID, false);

      expect(result).not.toHaveProperty("error");
      expect(mockUpdateReviewPublishedCommand).toHaveBeenCalledWith(
        VALID_UUID,
        false,
      );
    });

    test("成功後に REVIEWS キャッシュが無効化される", async () => {
      const { updateReviewPublished } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await updateReviewPublished(VALID_UUID, true);

      const calledTags = getUpdatedTags();
      expect(
        calledTags.some(
          (tag) => typeof tag === "string" && tag.includes("review"),
        ),
      ).toBe(true);
    });

    test("spaceId がある場合、スペース別レビューキャッシュも無効化される", async () => {
      mockUpdateReviewPublishedCommand.mockImplementation(() =>
        Promise.resolve({ spaceId: "space-abc" }),
      );

      const { updateReviewPublished } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await updateReviewPublished(VALID_UUID, true);

      // REVIEWS + reviews.space(spaceId) + reviews.stats(spaceId) の 3 タグが無効化される
      expect(mockUpdateTag.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test.each(INVALID_UUIDS)(
      "不正な UUID '%s' のとき fieldErrors を含むエラーを返す",
      async (invalidId) => {
        const { updateReviewPublished } =
          await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

        const result = await updateReviewPublished(invalidId, true);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("fieldErrors");
      },
    );

    test("バリデーション失敗時は updateReviewPublishedCommand が呼ばれない", async () => {
      const { updateReviewPublished } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await updateReviewPublished("invalid-uuid", true);

      expect(mockUpdateReviewPublishedCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("レビューが見つからない場合はエラーを返す", async () => {
      mockUpdateReviewPublishedCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("レビューが見つかりません", "NOT_FOUND"),
        ),
      );

      const { updateReviewPublished } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await updateReviewPublished(VALID_UUID, true);

      expectErrorResult(result);
      expect(result.error).toBe("レビューが見つかりません");
    });

    test("DomainError 以外のエラーは再スローされる", async () => {
      mockUpdateReviewPublishedCommand.mockImplementation(() =>
        Promise.reject(new Error("予期しないDBエラー")),
      );

      const { updateReviewPublished } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await expect(updateReviewPublished(VALID_UUID, true)).rejects.toThrow(
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

      const calledTags = getUpdatedTags();
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

      expectErrorResult(result);
      expect(result.error).toBe("レビューが見つかりません");
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

describe("replyToReview (conform Server Action signature)", () => {
  // Phase 1 Task 6 conform 移行で `(input)` → `(prev, formData) => SubmissionResult`
  // signature に変更。test は FormData を構築して `replyToReview(undefined, fd)`
  // で呼び出し、`SubmissionResult.status` / `submission.reply()` の error 形式で検証する。
  function buildReplyFormData(input: {
    reviewId: string;
    replyBody: string;
  }): FormData {
    const fd = new FormData();
    fd.set("reviewId", input.reviewId);
    fd.set("replyBody", input.replyBody);
    return fd;
  }

  const VALID_REPLY_INPUT = {
    reviewId: VALID_UUID,
    replyBody: "ご利用ありがとうございました。",
  };

  beforeEach(() => {
    mockReplyToReviewCommand.mockClear();
    mockUpdateTag.mockClear();
    mockSendReviewReplyEmail.mockClear();
    mockReplyToReviewCommand.mockImplementation(() =>
      Promise.resolve({
        spaceId: "space-1",
        emailContext: DEFAULT_EMAIL_CONTEXT,
      }),
    );
  });

  describe("正常系", () => {
    test("有効な入力で返信できる", async () => {
      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await replyToReview(
        undefined,
        buildReplyFormData(VALID_REPLY_INPUT),
      );

      expect(result.status).not.toBe("error");
      expect(mockReplyToReviewCommand).toHaveBeenCalledTimes(1);
    });

    test("成功後に 3 タグ（REVIEWS + reviews.space + reviews.stats）が無効化される", async () => {
      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await replyToReview(undefined, buildReplyFormData(VALID_REPLY_INPUT));

      const calledTags = getUpdatedTags();
      expect(calledTags).toContain("reviews");
      expect(calledTags).toContain("reviews-space-space-1");
      expect(calledTags).toContain("reviews-stats-space-1");
    });

    test("emailContext 付きの成功時は sendReviewReplyEmail が呼ばれる", async () => {
      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await replyToReview(undefined, buildReplyFormData(VALID_REPLY_INPUT));

      expect(mockSendReviewReplyEmail).toHaveBeenCalledTimes(1);
    });

    test("emailContext が null の場合は sendReviewReplyEmail が呼ばれない", async () => {
      mockReplyToReviewCommand.mockImplementation(() =>
        Promise.resolve({ spaceId: "space-1", emailContext: null }),
      );

      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await replyToReview(undefined, buildReplyFormData(VALID_REPLY_INPUT));

      expect(mockSendReviewReplyEmail).not.toHaveBeenCalled();
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test("不正な reviewId UUID はエラーを返す", async () => {
      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await replyToReview(
        undefined,
        buildReplyFormData({ reviewId: "not-a-uuid", replyBody: "返信" }),
      );

      expect(result.status).toBe("error");
      expect(mockReplyToReviewCommand).not.toHaveBeenCalled();
    });

    test("空の replyBody はエラーを返す", async () => {
      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await replyToReview(
        undefined,
        buildReplyFormData({ reviewId: VALID_UUID, replyBody: "" }),
      );

      expect(result.status).toBe("error");
      expect(mockReplyToReviewCommand).not.toHaveBeenCalled();
    });

    test("1001 文字の replyBody はエラーを返す", async () => {
      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await replyToReview(
        undefined,
        buildReplyFormData({
          reviewId: VALID_UUID,
          replyBody: "x".repeat(1001),
        }),
      );

      expect(result.status).toBe("error");
      expect(mockReplyToReviewCommand).not.toHaveBeenCalled();
    });
  });

  describe("異常系: DomainError", () => {
    test("レビューが見つからない場合はエラーを返す", async () => {
      mockReplyToReviewCommand.mockImplementation(() =>
        Promise.reject(
          new DomainError("レビューが見つかりません", "NOT_FOUND"),
        ),
      );

      const { replyToReview } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await replyToReview(
        undefined,
        buildReplyFormData(VALID_REPLY_INPUT),
      );

      // executeConformMutation が DomainError を `submission.reply({ formErrors: [error] })`
      // で返すため、result.error は `{ formErrors: [...] }` 構造を持つ
      expect(result.status).toBe("error");
      // error 詳細は formErrors 配列に格納される (conform 公式仕様)
    });
  });
});

describe("deleteReviewReply", () => {
  beforeEach(() => {
    mockDeleteReviewReplyCommand.mockClear();
    mockUpdateTag.mockClear();
    mockDeleteReviewReplyCommand.mockImplementation(() =>
      Promise.resolve({ spaceId: "space-1" }),
    );
  });

  describe("正常系", () => {
    test("有効な UUID で返信を削除できる", async () => {
      const { deleteReviewReply } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      const result = await deleteReviewReply(VALID_UUID);

      expect(result).not.toHaveProperty("error");
      expect(mockDeleteReviewReplyCommand).toHaveBeenCalledTimes(1);
      expect(mockDeleteReviewReplyCommand).toHaveBeenCalledWith(VALID_UUID);
    });

    test("成功後に 3 タグ（REVIEWS + reviews.space + reviews.stats）が無効化される", async () => {
      const { deleteReviewReply } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await deleteReviewReply(VALID_UUID);

      const calledTags = getUpdatedTags();
      expect(calledTags).toContain("reviews");
      expect(calledTags).toContain("reviews-space-space-1");
      expect(calledTags).toContain("reviews-stats-space-1");
    });
  });

  describe("異常系: バリデーションエラー", () => {
    test.each(INVALID_UUIDS)(
      "不正な UUID '%s' でエラーを返す",
      async (invalidId) => {
        const { deleteReviewReply } =
          await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

        const result = await deleteReviewReply(invalidId);

        expect(result).toHaveProperty("error");
        expect(result).toHaveProperty("fieldErrors");
      },
    );

    test("バリデーション失敗時は deleteReviewReplyCommand が呼ばれない", async () => {
      const { deleteReviewReply } =
        await import("@/app/(admin)/admin/(dashboard)/_shared/actions/review");

      await deleteReviewReply("invalid-uuid");

      expect(mockDeleteReviewReplyCommand).not.toHaveBeenCalled();
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
