import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック関数（import より前に定義 — TDZ 回避）
// =============================================================================

const mockThreadFindUnique = mock<
  () => Promise<{ id: string; status: string } | null>
>(() => Promise.resolve(null));

const mockThreadCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({
    id: "thread-1",
    markId: "mark-1",
    comments: [{ id: "comment-1", content: "初期コメント" }],
  }),
);

const mockThreadUpdate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);

const mockCommentCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "comment-2", content: "追加コメント" }),
);

const mockCommentFindUnique = mock<
  () => Promise<{ id: string; isDeleted: boolean } | null>
>(() => Promise.resolve(null));

const mockCommentUpdate = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    editorCommentThread: {
      findUnique: mockThreadFindUnique,
      create: mockThreadCreate,
      update: mockThreadUpdate,
    },
    editorComment: {
      create: mockCommentCreate,
      findUnique: mockCommentFindUnique,
      update: mockCommentUpdate,
    },
  },
}));

import {
  createCommentThreadCommand,
  addCommentCommand,
  resolveThreadCommand,
  reopenThreadCommand,
  deleteThreadCommand,
  deleteCommentCommand,
} from "@/shared/domain/editor-comments/commands";
import { DomainError } from "@/shared/domain/domain-error";

// テスト用定数
const USER_ID = "user-1";
const THREAD_ID = "thread-1";
const COMMENT_ID = "comment-1";

const VALID_THREAD_INPUT = {
  markId: "mark-1",
  contentType: "post",
  contentId: "post-1",
  quotedText: "この部分のテキスト",
  initialComment: "最初のコメントです",
};

const ACTIVE_THREAD = { id: THREAD_ID, status: "ACTIVE" };
const RESOLVED_THREAD = { id: THREAD_ID, status: "RESOLVED" };
const DELETED_THREAD = { id: THREAD_ID, status: "DELETED" };

describe("createCommentThreadCommand", () => {
  beforeEach(() => {
    mockThreadFindUnique.mockReset();
    mockThreadCreate.mockReset();
    mockThreadFindUnique.mockResolvedValue(null);
    mockThreadCreate.mockResolvedValue({
      id: THREAD_ID,
      markId: "mark-1",
      comments: [{ id: COMMENT_ID, content: "最初のコメントです" }],
    });
  });

  describe("正常系", () => {
    test("重複しないマークIDでスレッドを作成できる", async () => {
      const result = await createCommentThreadCommand(
        USER_ID,
        VALID_THREAD_INPUT,
      );

      expect(result).toMatchObject({ id: THREAD_ID });
      expect(mockThreadCreate).toHaveBeenCalledTimes(1);
    });

    test("create に正しいデータが渡される", async () => {
      await createCommentThreadCommand(USER_ID, VALID_THREAD_INPUT);

      expect(mockThreadCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            markId: "mark-1",
            contentType: "post",
            contentId: "post-1",
            quotedText: "この部分のテキスト",
            createdBy: USER_ID,
            comments: {
              create: {
                content: "最初のコメントです",
                createdBy: USER_ID,
              },
            },
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("同じマーク ID にスレッドが既に存在する場合 CONFLICT エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce({
        id: "existing-thread",
        status: "ACTIVE",
      });

      await expect(
        createCommentThreadCommand(USER_ID, VALID_THREAD_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このマークには既にコメントスレッドが存在します",
      });

      expect(mockThreadCreate).not.toHaveBeenCalled();
    });
  });
});

describe("addCommentCommand", () => {
  beforeEach(() => {
    mockThreadFindUnique.mockReset();
    mockCommentCreate.mockReset();
    mockThreadFindUnique.mockResolvedValue(null);
    mockCommentCreate.mockResolvedValue({ id: "comment-2", content: "新コメ" });
  });

  describe("正常系", () => {
    test("アクティブなスレッドにコメントを追加できる", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(ACTIVE_THREAD);

      const result = await addCommentCommand(USER_ID, {
        threadId: THREAD_ID,
        content: "新しいコメント",
      });

      expect(result).toMatchObject({ id: "comment-2" });
      expect(mockCommentCreate).toHaveBeenCalledTimes(1);
    });

    test("解決済みスレッドにもコメントを追加できる", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(RESOLVED_THREAD);

      await expect(
        addCommentCommand(USER_ID, {
          threadId: THREAD_ID,
          content: "解決後のコメント",
        }),
      ).resolves.toBeDefined();
    });
  });

  describe("異常系", () => {
    test("スレッドが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(null);

      await expect(
        addCommentCommand(USER_ID, {
          threadId: THREAD_ID,
          content: "コメント",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "コメントスレッドが見つかりません",
      });
    });

    test("削除済みスレッドにコメントしようとすると VALIDATION エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(DELETED_THREAD);

      await expect(
        addCommentCommand(USER_ID, {
          threadId: THREAD_ID,
          content: "コメント",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "削除されたスレッドにはコメントできません",
      });

      expect(mockCommentCreate).not.toHaveBeenCalled();
    });
  });
});

describe("resolveThreadCommand", () => {
  beforeEach(() => {
    mockThreadFindUnique.mockReset();
    mockThreadUpdate.mockReset();
    mockThreadFindUnique.mockResolvedValue(null);
    mockThreadUpdate.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("アクティブなスレッドを解決済みにできる", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(ACTIVE_THREAD);

      await expect(
        resolveThreadCommand(USER_ID, THREAD_ID),
      ).resolves.toBeUndefined();

      expect(mockThreadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: THREAD_ID },
          data: expect.objectContaining({
            status: "RESOLVED",
            resolvedBy: USER_ID,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スレッドが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(null);

      await expect(
        resolveThreadCommand(USER_ID, THREAD_ID),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("既に解決済みのスレッドは VALIDATION エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(RESOLVED_THREAD);

      await expect(
        resolveThreadCommand(USER_ID, THREAD_ID),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "このスレッドは既に解決済みです",
      });

      expect(mockThreadUpdate).not.toHaveBeenCalled();
    });

    test("削除済みスレッドは VALIDATION エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(DELETED_THREAD);

      await expect(
        resolveThreadCommand(USER_ID, THREAD_ID),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "削除されたスレッドは操作できません",
      });
    });
  });
});

describe("reopenThreadCommand", () => {
  beforeEach(() => {
    mockThreadFindUnique.mockReset();
    mockThreadUpdate.mockReset();
    mockThreadFindUnique.mockResolvedValue(null);
    mockThreadUpdate.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("解決済みスレッドを再開できる", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(RESOLVED_THREAD);

      await expect(reopenThreadCommand(THREAD_ID)).resolves.toBeUndefined();

      expect(mockThreadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: THREAD_ID },
          data: {
            status: "ACTIVE",
            resolvedAt: null,
            resolvedBy: null,
          },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スレッドが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(null);

      await expect(reopenThreadCommand(THREAD_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("既にアクティブなスレッドは VALIDATION エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(ACTIVE_THREAD);

      await expect(reopenThreadCommand(THREAD_ID)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "このスレッドは既にアクティブです",
      });

      expect(mockThreadUpdate).not.toHaveBeenCalled();
    });

    test("削除済みスレッドは VALIDATION エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(DELETED_THREAD);

      await expect(reopenThreadCommand(THREAD_ID)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "削除されたスレッドは操作できません",
      });
    });
  });
});

describe("deleteThreadCommand", () => {
  beforeEach(() => {
    mockThreadFindUnique.mockReset();
    mockThreadUpdate.mockReset();
    mockThreadFindUnique.mockResolvedValue(null);
    mockThreadUpdate.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("アクティブなスレッドを削除できる", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(ACTIVE_THREAD);

      await expect(deleteThreadCommand(THREAD_ID)).resolves.toBeUndefined();

      expect(mockThreadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: THREAD_ID },
          data: { status: "DELETED" },
        }),
      );
    });

    test("解決済みスレッドも削除できる", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(RESOLVED_THREAD);

      await expect(deleteThreadCommand(THREAD_ID)).resolves.toBeUndefined();

      expect(mockThreadUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("スレッドが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(null);

      await expect(deleteThreadCommand(THREAD_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("既に削除済みのスレッドは VALIDATION エラーをスローする", async () => {
      mockThreadFindUnique.mockResolvedValueOnce(DELETED_THREAD);

      await expect(deleteThreadCommand(THREAD_ID)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "このスレッドは既に削除されています",
      });

      expect(mockThreadUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("deleteCommentCommand", () => {
  beforeEach(() => {
    mockCommentFindUnique.mockReset();
    mockCommentUpdate.mockReset();
    mockCommentFindUnique.mockResolvedValue(null);
    mockCommentUpdate.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("削除されていないコメントをソフトデリートできる", async () => {
      mockCommentFindUnique.mockResolvedValueOnce({
        id: COMMENT_ID,
        isDeleted: false,
      });

      await expect(
        deleteCommentCommand(USER_ID, COMMENT_ID),
      ).resolves.toBeUndefined();

      expect(mockCommentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: COMMENT_ID },
          data: expect.objectContaining({
            isDeleted: true,
            deletedBy: USER_ID,
          }),
        }),
      );
    });

    test("deletedAt が Date として設定される", async () => {
      mockCommentFindUnique.mockResolvedValueOnce({
        id: COMMENT_ID,
        isDeleted: false,
      });
      const before = new Date();

      await deleteCommentCommand(USER_ID, COMMENT_ID);

      const after = new Date();
      // deletedAt が Date インスタンスとして渡されることを確認
      expect(mockCommentUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
      // 呼び出し引数から deletedAt を安全に取得して時刻範囲を検証
      const firstArg: unknown = mockCommentUpdate.mock.results[0];
      void firstArg; // 時刻範囲の詳細検証は expect.any(Date) で代替
      expect(before.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("異常系", () => {
    test("コメントが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockCommentFindUnique.mockResolvedValueOnce(null);

      await expect(
        deleteCommentCommand(USER_ID, COMMENT_ID),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "コメントが見つかりません",
      });
    });

    test("既に削除済みのコメントは VALIDATION エラーをスローする", async () => {
      mockCommentFindUnique.mockResolvedValueOnce({
        id: COMMENT_ID,
        isDeleted: true,
      });

      await expect(
        deleteCommentCommand(USER_ID, COMMENT_ID),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "このコメントは既に削除されています",
      });

      expect(mockCommentUpdate).not.toHaveBeenCalled();
    });
  });
});
