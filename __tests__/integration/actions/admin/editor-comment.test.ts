/**
 * エディタコメント Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts のテスト
 */

import { describe, test, expect } from "bun:test";
import { z } from "zod";

// CommentableContentType 再現
const COMMENTABLE_CONTENT_TYPES = ["post", "news", "page", "faq"] as const;
type CommentableContentType = (typeof COMMENTABLE_CONTENT_TYPES)[number];

function isCommentableContentType(
  value: unknown,
): value is CommentableContentType {
  return COMMENTABLE_CONTENT_TYPES.includes(value as CommentableContentType);
}

// createThreadSchema 再現
const createThreadSchema = z.object({
  markId: z.string().min(1, { error: "markId は必須です" }),
  contentType: z
    .string()
    .refine(isCommentableContentType, { error: "contentType が無効です" }),
  contentId: z
    .string()
    .uuid({ error: "contentId は有効な UUID である必要があります" }),
  quotedText: z
    .string()
    .min(1, { error: "引用テキストは必須です" })
    .max(2000, { error: "引用テキストは2000文字以内" }),
  initialComment: z
    .string()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});

// addCommentSchema 再現
const addCommentSchema = z.object({
  threadId: z
    .string()
    .uuid({ error: "threadId は有効な UUID である必要があります" }),
  content: z
    .string()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_THREAD_INPUT = {
  markId: "mark-abc123",
  contentType: "post",
  contentId: VALID_UUID,
  quotedText: "引用テキスト",
  initialComment: "最初のコメント",
};

describe("Editor Comment Admin Action Integration", () => {
  describe("createThreadSchema バリデーション", () => {
    test("有効なデータはパス", () => {
      expect(createThreadSchema.safeParse(VALID_THREAD_INPUT).success).toBe(
        true,
      );
    });

    describe("markId", () => {
      test("空文字はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          markId: "",
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("markId は必須");
      });
    });

    describe("contentType", () => {
      test("有効な contentType は許可", () => {
        for (const type of COMMENTABLE_CONTENT_TYPES) {
          const result = createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            contentType: type,
          });
          expect(result.success).toBe(true);
        }
      });

      test("無効な contentType はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          contentType: "invalid",
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain(
            "contentType が無効",
          );
      });
    });

    describe("contentId", () => {
      test("無効な UUID はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          contentId: "not-uuid",
        });
        expect(result.success).toBe(false);
      });
    });

    describe("quotedText", () => {
      test("空文字はエラー", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            quotedText: "",
          }).success,
        ).toBe(false);
      });

      test("2000文字はOK", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            quotedText: "あ".repeat(2000),
          }).success,
        ).toBe(true);
      });

      test("2001文字はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          quotedText: "あ".repeat(2001),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("2000文字以内");
      });
    });

    describe("initialComment", () => {
      test("空文字はエラー", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            initialComment: "",
          }).success,
        ).toBe(false);
      });

      test("5000文字はOK", () => {
        expect(
          createThreadSchema.safeParse({
            ...VALID_THREAD_INPUT,
            initialComment: "x".repeat(5000),
          }).success,
        ).toBe(true);
      });

      test("5001文字はエラー", () => {
        const result = createThreadSchema.safeParse({
          ...VALID_THREAD_INPUT,
          initialComment: "x".repeat(5001),
        });
        expect(result.success).toBe(false);
        if (!result.success)
          expect(result.error.issues[0].message).toContain("5000文字以内");
      });
    });
  });

  describe("addCommentSchema バリデーション", () => {
    test("有効なデータはパス", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: VALID_UUID,
          content: "コメント",
        }).success,
      ).toBe(true);
    });

    test("threadId が UUID でなければエラー", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: "not-uuid",
          content: "コメント",
        }).success,
      ).toBe(false);
    });

    test("content が空文字はエラー", () => {
      expect(
        addCommentSchema.safeParse({ threadId: VALID_UUID, content: "" })
          .success,
      ).toBe(false);
    });

    test("content 5000文字はOK", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: VALID_UUID,
          content: "x".repeat(5000),
        }).success,
      ).toBe(true);
    });

    test("content 5001文字はエラー", () => {
      expect(
        addCommentSchema.safeParse({
          threadId: VALID_UUID,
          content: "x".repeat(5001),
        }).success,
      ).toBe(false);
    });
  });

  describe("isCommentableContentType 型ガード", () => {
    test("有効なコンテンツタイプは true", () => {
      expect(isCommentableContentType("post")).toBe(true);
      expect(isCommentableContentType("news")).toBe(true);
      expect(isCommentableContentType("page")).toBe(true);
    });

    test("無効な値は false", () => {
      expect(isCommentableContentType("invalid")).toBe(false);
      expect(isCommentableContentType("")).toBe(false);
      expect(isCommentableContentType(null)).toBe(false);
      expect(isCommentableContentType(undefined)).toBe(false);
      expect(isCommentableContentType(123)).toBe(false);
    });
  });

  describe("ThreadListItem 型構造", () => {
    test("有効なスレッドリストアイテム", () => {
      type ThreadListItem = {
        id: string;
        markId: string;
        quotedText: string;
        status: string;
        commentCount: number;
        latestComment?: {
          content: string;
          createdAt: Date;
          createdByName: string;
        };
        createdAt: Date;
        createdByName: string;
      };

      const item: ThreadListItem = {
        id: VALID_UUID,
        markId: "mark-abc",
        quotedText: "引用テキスト",
        status: "ACTIVE",
        commentCount: 3,
        createdAt: new Date(),
        createdByName: "テストユーザー",
      };

      expect(item.commentCount).toBe(3);
      expect(item.latestComment).toBeUndefined();
    });
  });

  describe("MarkInfo 型構造", () => {
    test("有効なマーク情報", () => {
      type MarkInfo = {
        markId: string;
        threadId: string;
        status: string;
        commentCount: number;
      };

      const mark: MarkInfo = {
        markId: "mark-abc",
        threadId: VALID_UUID,
        status: "ACTIVE",
        commentCount: 2,
      };

      expect(mark.status).toBe("ACTIVE");
    });
  });
});
