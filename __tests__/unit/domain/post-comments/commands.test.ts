import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（import より前に定義 — TDZ 回避）
const mockPostCommentFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockPostCommentUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "comment-1" }),
);
const mockPostCommentFindMany = mock<() => Promise<Record<string, unknown>[]>>(
  () => Promise.resolve([]),
);
const mockPostCommentUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    postComment: {
      findUnique: mockPostCommentFindUnique,
      update: mockPostCommentUpdate,
      findMany: mockPostCommentFindMany,
      updateMany: mockPostCommentUpdateMany,
    },
  },
}));

// エラーログモック
const mockLogError = mock<() => void>(() => undefined);
const mockNormalizeError = mock<(e: unknown) => Error>((e) =>
  e instanceof Error ? e : new Error(String(e)),
);

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: mockNormalizeError,
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

import {
  deleteComment,
  deleteComments,
  restoreComment,
} from "@/shared/domain/post-comments/commands";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// テスト用定数
// =============================================================================

const COMMENT_ID = "comment-1";
const DELETED_BY = "admin-1";
const POST_SLUG = "test-post";

const EXISTING_COMMENT = {
  id: COMMENT_ID,
  isDeleted: false,
  post: { slug: POST_SLUG },
};

const DELETED_COMMENT = {
  id: COMMENT_ID,
  isDeleted: true,
  post: { slug: POST_SLUG },
};

// =============================================================================
// deleteComment
// =============================================================================

describe("deleteComment", () => {
  beforeEach(() => {
    mockPostCommentFindUnique.mockReset();
    mockPostCommentUpdate.mockReset();
    mockLogError.mockReset();

    mockPostCommentFindUnique.mockResolvedValue(EXISTING_COMMENT);
    mockPostCommentUpdate.mockResolvedValue({ id: COMMENT_ID });
  });

  describe("正常系", () => {
    test("コメントをソフトデリートして postSlug を返す", async () => {
      const result = await deleteComment(COMMENT_ID, DELETED_BY);

      expect(result).toEqual({ postSlug: POST_SLUG });
    });

    test("update が isDeleted: true で呼ばれる", async () => {
      await deleteComment(COMMENT_ID, DELETED_BY);

      expect(mockPostCommentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isDeleted: true,
          }),
        }),
      );
    });

    test("update に deletedBy が設定される", async () => {
      await deleteComment(COMMENT_ID, DELETED_BY);

      expect(mockPostCommentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: COMMENT_ID },
          data: expect.objectContaining({
            deletedBy: DELETED_BY,
          }),
        }),
      );
    });

    test("update に deletedAt が設定される", async () => {
      await deleteComment(COMMENT_ID, DELETED_BY);

      expect(mockPostCommentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("findUnique が正しい ID で呼ばれる", async () => {
      await deleteComment(COMMENT_ID, DELETED_BY);

      expect(mockPostCommentFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: COMMENT_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("コメントが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostCommentFindUnique.mockResolvedValue(null);

      await expect(
        deleteComment("non-existent", DELETED_BY),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "コメントが見つかりません",
      });
    });

    test("コメントが存在しない場合 update が呼ばれない", async () => {
      mockPostCommentFindUnique.mockResolvedValue(null);

      await expect(deleteComment("non-existent", DELETED_BY)).rejects.toThrow(
        DomainError,
      );

      expect(mockPostCommentUpdate).not.toHaveBeenCalled();
    });

    test("DB エラー発生時に汎用エラーをスローする", async () => {
      mockPostCommentUpdate.mockRejectedValue(new Error("DB connection error"));

      await expect(deleteComment(COMMENT_ID, DELETED_BY)).rejects.toMatchObject(
        {
          message: "コメントの削除中にエラーが発生しました",
        },
      );
    });

    test("DB エラー発生時に logError が呼ばれる", async () => {
      mockPostCommentUpdate.mockRejectedValue(new Error("DB connection error"));

      await expect(deleteComment(COMMENT_ID, DELETED_BY)).rejects.toThrow(
        DomainError,
      );

      expect(mockLogError).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// deleteComments
// =============================================================================

describe("deleteComments", () => {
  beforeEach(() => {
    mockPostCommentFindMany.mockReset();
    mockPostCommentUpdateMany.mockReset();
    mockLogError.mockReset();

    mockPostCommentFindMany.mockResolvedValue([
      { post: { slug: POST_SLUG } },
      { post: { slug: "another-post" } },
    ]);
    mockPostCommentUpdateMany.mockResolvedValue({ count: 2 });
  });

  describe("正常系", () => {
    test("複数コメントをまとめてソフトデリートして count と postSlugs を返す", async () => {
      const result = await deleteComments(
        ["comment-1", "comment-2"],
        DELETED_BY,
      );

      expect(result).toEqual({
        count: 2,
        postSlugs: [POST_SLUG, "another-post"],
      });
    });

    test("同じスラッグを持つ複数コメントは重複除去される", async () => {
      mockPostCommentFindMany.mockResolvedValue([
        { post: { slug: POST_SLUG } },
        { post: { slug: POST_SLUG } },
        { post: { slug: POST_SLUG } },
      ]);
      mockPostCommentUpdateMany.mockResolvedValue({ count: 3 });

      const result = await deleteComments(
        ["comment-1", "comment-2", "comment-3"],
        DELETED_BY,
      );

      expect(result.postSlugs).toEqual([POST_SLUG]);
    });

    test("updateMany が isDeleted: true と deletedBy で呼ばれる", async () => {
      await deleteComments(["comment-1", "comment-2"], DELETED_BY);

      expect(mockPostCommentUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["comment-1", "comment-2"] } },
          data: expect.objectContaining({
            isDeleted: true,
            deletedBy: DELETED_BY,
          }),
        }),
      );
    });

    test("1件だけでも正常に処理される", async () => {
      mockPostCommentFindMany.mockResolvedValue([
        { post: { slug: POST_SLUG } },
      ]);
      mockPostCommentUpdateMany.mockResolvedValue({ count: 1 });

      const result = await deleteComments([COMMENT_ID], DELETED_BY);

      expect(result.count).toBe(1);
    });
  });

  describe("異常系", () => {
    test("空配列を渡すと VALIDATION エラーをスローする", async () => {
      await expect(deleteComments([], DELETED_BY)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "削除するコメントを選択してください",
      });
    });

    test("空配列の場合 findMany が呼ばれない", async () => {
      await expect(deleteComments([], DELETED_BY)).rejects.toThrow(DomainError);

      expect(mockPostCommentFindMany).not.toHaveBeenCalled();
      expect(mockPostCommentUpdateMany).not.toHaveBeenCalled();
    });

    test("DB エラー発生時に汎用エラーをスローする", async () => {
      mockPostCommentUpdateMany.mockRejectedValue(
        new Error("DB connection error"),
      );

      await expect(
        deleteComments(["comment-1"], DELETED_BY),
      ).rejects.toMatchObject({
        message: "コメントの削除中にエラーが発生しました",
      });
    });

    test("DB エラー発生時に logError が呼ばれる", async () => {
      mockPostCommentUpdateMany.mockRejectedValue(
        new Error("DB connection error"),
      );

      await expect(deleteComments(["comment-1"], DELETED_BY)).rejects.toThrow(
        DomainError,
      );

      expect(mockLogError).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// restoreComment
// =============================================================================

describe("restoreComment", () => {
  beforeEach(() => {
    mockPostCommentFindUnique.mockReset();
    mockPostCommentUpdate.mockReset();
    mockLogError.mockReset();

    mockPostCommentFindUnique.mockResolvedValue(DELETED_COMMENT);
    mockPostCommentUpdate.mockResolvedValue({ id: COMMENT_ID });
  });

  describe("正常系", () => {
    test("削除済みコメントを復元して postSlug を返す", async () => {
      const result = await restoreComment(COMMENT_ID);

      expect(result).toEqual({ postSlug: POST_SLUG });
    });

    test("update が isDeleted: false で呼ばれる", async () => {
      await restoreComment(COMMENT_ID);

      expect(mockPostCommentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: COMMENT_ID },
          data: expect.objectContaining({
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
          }),
        }),
      );
    });

    test("deletedAt と deletedBy が null にリセットされる", async () => {
      await restoreComment(COMMENT_ID);

      expect(mockPostCommentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: null,
            deletedBy: null,
          }),
        }),
      );
    });

    test("findUnique が正しい ID で呼ばれる", async () => {
      await restoreComment(COMMENT_ID);

      expect(mockPostCommentFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: COMMENT_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("コメントが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockPostCommentFindUnique.mockResolvedValue(null);

      await expect(restoreComment("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "コメントが見つかりません",
      });
    });

    test("削除されていないコメントを復元しようとすると CONFLICT エラーをスローする", async () => {
      mockPostCommentFindUnique.mockResolvedValue(EXISTING_COMMENT); // isDeleted: false

      await expect(restoreComment(COMMENT_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このコメントは削除されていません",
      });
    });

    test("削除されていないコメントでは update が呼ばれない", async () => {
      mockPostCommentFindUnique.mockResolvedValue(EXISTING_COMMENT);

      await expect(restoreComment(COMMENT_ID)).rejects.toThrow(DomainError);

      expect(mockPostCommentUpdate).not.toHaveBeenCalled();
    });

    test("コメントが存在しない場合 update が呼ばれない", async () => {
      mockPostCommentFindUnique.mockResolvedValue(null);

      await expect(restoreComment("non-existent")).rejects.toThrow(DomainError);

      expect(mockPostCommentUpdate).not.toHaveBeenCalled();
    });

    test("DB エラー発生時に汎用エラーをスローする", async () => {
      mockPostCommentUpdate.mockRejectedValue(new Error("DB connection error"));

      await expect(restoreComment(COMMENT_ID)).rejects.toMatchObject({
        message: "コメントの復元中にエラーが発生しました",
      });
    });

    test("DB エラー発生時に logError が呼ばれる", async () => {
      mockPostCommentUpdate.mockRejectedValue(new Error("DB connection error"));

      await expect(restoreComment(COMMENT_ID)).rejects.toThrow(DomainError);

      expect(mockLogError).toHaveBeenCalledTimes(1);
    });
  });
});
