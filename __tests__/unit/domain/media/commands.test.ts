import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（import より前に定義 — TDZ 回避）
const mockMediaCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "media-1", url: "https://example.com/image.jpg" }),
);
const mockMediaFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockMediaUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "media-1" }),
);
const mockMediaUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockMediaFindMany = mock<() => Promise<Record<string, unknown>[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    media: {
      create: mockMediaCreate,
      findUnique: mockMediaFindUnique,
      update: mockMediaUpdate,
      updateMany: mockMediaUpdateMany,
      findMany: mockMediaFindMany,
    },
  },
}));

// storage モック
const mockUploadFile = mock<
  () => Promise<{
    success: boolean;
    url?: string;
    path?: string;
    error?: string;
  }>
>(() =>
  Promise.resolve({
    success: true,
    url: "https://example.com/image.jpg",
    path: "media/image.jpg",
  }),
);
const mockDeleteFile = mock<() => Promise<void>>(() => Promise.resolve());
const mockDeleteFiles = mock<() => Promise<void>>(() => Promise.resolve());

mock.module("@/shared/lib/storage", () => ({
  uploadFile: mockUploadFile,
  deleteFile: mockDeleteFile,
  deleteFiles: mockDeleteFiles,
}));

// supabase モック
mock.module("@/shared/lib/supabase", () => ({
  STORAGE_BUCKETS: {
    SPACES: "spaces",
    POSTS: "posts",
    SITE: "site",
    MEDIA: "media",
  },
}));

import {
  uploadMediaCommand,
  updateMediaCommand,
  deleteMediaCommand,
  bulkDeleteMediaCommand,
} from "@/shared/domain/media/commands";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// テスト用定数
// =============================================================================

const MEDIA_ID = "media-1";
const USER_ID = "user-1";
const STORAGE_PATH = "media/image.jpg";
const MEDIA_URL = "https://example.com/image.jpg";

const MOCK_FILE = new File(["content"], "image.jpg", { type: "image/jpeg" });

const UPLOAD_INPUT = {
  file: MOCK_FILE,
  folder: "media",
  uploadedBy: USER_ID,
  type: "IMAGE" as const,
  usage: "GENERAL" as const,
  alt: "テスト画像",
  title: "テスト画像タイトル",
  description: "テスト画像の説明",
  tags: ["tag1", "tag2"],
};

const EXISTING_MEDIA = {
  id: MEDIA_ID,
  uploadedBy: USER_ID,
};

const EXISTING_MEDIA_WITH_PATH = {
  id: MEDIA_ID,
  storagePath: STORAGE_PATH,
};

// =============================================================================
// uploadMediaCommand
// =============================================================================

describe("uploadMediaCommand", () => {
  beforeEach(() => {
    mockUploadFile.mockReset();
    mockMediaCreate.mockReset();
    mockDeleteFile.mockReset();

    mockUploadFile.mockResolvedValue({
      success: true,
      url: MEDIA_URL,
      path: STORAGE_PATH,
    });
    mockMediaCreate.mockResolvedValue({ id: MEDIA_ID, url: MEDIA_URL });
  });

  describe("正常系", () => {
    test("ファイルをアップロードして media レコードを作成できる", async () => {
      const result = await uploadMediaCommand(UPLOAD_INPUT);

      expect(result).toEqual({ id: MEDIA_ID, url: MEDIA_URL });
      expect(mockUploadFile).toHaveBeenCalledTimes(1);
      expect(mockMediaCreate).toHaveBeenCalledTimes(1);
    });

    test("usage が指定されない場合 GENERAL として保存される", async () => {
      await uploadMediaCommand({
        ...UPLOAD_INPUT,
        usage: null,
      });

      expect(mockMediaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            usage: "GENERAL",
          }),
        }),
      );
    });

    test("alt / title / description が null でも正常に動作する", async () => {
      const result = await uploadMediaCommand({
        ...UPLOAD_INPUT,
        alt: null,
        title: null,
        description: null,
      });

      expect(result).toEqual({ id: MEDIA_ID, url: MEDIA_URL });
    });

    test("media.create に正しいファイル情報が渡される", async () => {
      await uploadMediaCommand(UPLOAD_INPUT);

      expect(mockMediaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            filename: "image.jpg",
            storagePath: STORAGE_PATH,
            url: MEDIA_URL,
            bucket: "media",
            mimeType: "image/jpeg",
            uploadedBy: USER_ID,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("ストレージアップロードが失敗した場合 DomainError をスローする", async () => {
      mockUploadFile.mockResolvedValue({
        success: false,
        error: "ストレージエラー",
      });

      await expect(uploadMediaCommand(UPLOAD_INPUT)).rejects.toMatchObject({
        code: "UNEXPECTED",
        message: "ストレージエラー",
      });
    });

    test("ストレージアップロードが失敗（エラーメッセージなし）でも DomainError をスローする", async () => {
      mockUploadFile.mockResolvedValue({
        success: false,
      });

      await expect(uploadMediaCommand(UPLOAD_INPUT)).rejects.toMatchObject({
        code: "UNEXPECTED",
        message: "アップロードに失敗しました",
      });
    });

    test("URL が返されない場合 DomainError をスローする", async () => {
      mockUploadFile.mockResolvedValue({
        success: true,
        path: STORAGE_PATH,
        // url が欠落
      });

      await expect(uploadMediaCommand(UPLOAD_INPUT)).rejects.toThrow(
        DomainError,
      );
    });

    test("DB 作成失敗時にアップロード済みファイルが削除される", async () => {
      mockMediaCreate.mockRejectedValue(new Error("DB error"));

      await expect(uploadMediaCommand(UPLOAD_INPUT)).rejects.toThrow(
        DomainError,
      );

      expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_PATH, "media");
    });

    test("アップロード失敗時は DB 作成が呼ばれない", async () => {
      mockUploadFile.mockResolvedValue({
        success: false,
        error: "Upload failed",
      });

      await expect(uploadMediaCommand(UPLOAD_INPUT)).rejects.toThrow(
        DomainError,
      );

      expect(mockMediaCreate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateMediaCommand
// =============================================================================

describe("updateMediaCommand", () => {
  beforeEach(() => {
    mockMediaFindUnique.mockReset();
    mockMediaUpdate.mockReset();

    mockMediaFindUnique.mockResolvedValue(EXISTING_MEDIA);
    mockMediaUpdate.mockResolvedValue({ id: MEDIA_ID });
  });

  describe("正常系", () => {
    test("メディアのメタ情報を更新できる", async () => {
      await updateMediaCommand({
        id: MEDIA_ID,
        userId: USER_ID,
        restrictToOwnUploads: false,
        alt: "新しいalt",
        title: "新しいタイトル",
        description: "新しい説明",
        tags: ["新タグ"],
        usage: "GENERAL",
      });

      expect(mockMediaUpdate).toHaveBeenCalledTimes(1);
    });

    test("restrictToOwnUploads が false の場合、他ユーザーのメディアも更新できる", async () => {
      mockMediaFindUnique.mockResolvedValue({
        id: MEDIA_ID,
        uploadedBy: "other-user",
      });

      await updateMediaCommand({
        id: MEDIA_ID,
        userId: USER_ID,
        restrictToOwnUploads: false,
        alt: null,
        title: null,
        description: null,
        tags: [],
        usage: "GENERAL",
      });

      expect(mockMediaUpdate).toHaveBeenCalledTimes(1);
    });

    test("restrictToOwnUploads が true でも自分のメディアは更新できる", async () => {
      await updateMediaCommand({
        id: MEDIA_ID,
        userId: USER_ID,
        restrictToOwnUploads: true,
        alt: null,
        title: null,
        description: null,
        tags: [],
        usage: "GENERAL",
      });

      expect(mockMediaUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しい ID と data で呼ばれる", async () => {
      await updateMediaCommand({
        id: MEDIA_ID,
        userId: USER_ID,
        restrictToOwnUploads: false,
        alt: "テストalt",
        title: null,
        description: null,
        tags: ["tag1"],
        usage: "GENERAL",
      });

      expect(mockMediaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEDIA_ID },
          data: expect.objectContaining({
            alt: "テストalt",
            tags: ["tag1"],
            usage: "GENERAL",
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("メディアが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockMediaFindUnique.mockResolvedValue(null);

      await expect(
        updateMediaCommand({
          id: "non-existent",
          userId: USER_ID,
          restrictToOwnUploads: false,
          alt: null,
          title: null,
          description: null,
          tags: [],
          usage: "GENERAL",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "メディアが見つかりません",
      });
    });

    test("restrictToOwnUploads が true で他ユーザーのメディアは UNAUTHORIZED エラーをスローする", async () => {
      mockMediaFindUnique.mockResolvedValue({
        id: MEDIA_ID,
        uploadedBy: "other-user",
      });

      await expect(
        updateMediaCommand({
          id: MEDIA_ID,
          userId: USER_ID,
          restrictToOwnUploads: true,
          alt: null,
          title: null,
          description: null,
          tags: [],
          usage: "GENERAL",
        }),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
        message: "このメディアを編集する権限がありません",
      });
    });

    test("存在しないメディアでは update が呼ばれない", async () => {
      mockMediaFindUnique.mockResolvedValue(null);

      await expect(
        updateMediaCommand({
          id: "non-existent",
          userId: USER_ID,
          restrictToOwnUploads: false,
          alt: null,
          title: null,
          description: null,
          tags: [],
          usage: "GENERAL",
        }),
      ).rejects.toThrow(DomainError);

      expect(mockMediaUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// deleteMediaCommand
// =============================================================================

describe("deleteMediaCommand", () => {
  beforeEach(() => {
    mockMediaFindUnique.mockReset();
    mockMediaUpdate.mockReset();
    mockDeleteFile.mockReset();

    mockMediaFindUnique.mockResolvedValue(EXISTING_MEDIA_WITH_PATH);
    mockMediaUpdate.mockResolvedValue({ id: MEDIA_ID });
    mockDeleteFile.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("メディアをソフトデリートできる", async () => {
      await deleteMediaCommand(MEDIA_ID);

      expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_PATH, "media");
      expect(mockMediaUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEDIA_ID },
          data: { isActive: false },
        }),
      );
    });

    test("ストレージファイルが削除される", async () => {
      await deleteMediaCommand(MEDIA_ID);

      expect(mockDeleteFile).toHaveBeenCalledTimes(1);
      expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_PATH, "media");
    });

    test("戻り値が void（undefined）", async () => {
      const result = await deleteMediaCommand(MEDIA_ID);

      expect(result).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("メディアが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockMediaFindUnique.mockResolvedValue(null);

      await expect(deleteMediaCommand("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "メディアが見つかりません",
      });
    });

    test("存在しないメディアではストレージ削除も update も呼ばれない", async () => {
      mockMediaFindUnique.mockResolvedValue(null);

      await expect(deleteMediaCommand("non-existent")).rejects.toThrow(
        DomainError,
      );

      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(mockMediaUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// bulkDeleteMediaCommand
// =============================================================================

describe("bulkDeleteMediaCommand", () => {
  beforeEach(() => {
    mockMediaFindMany.mockReset();
    mockMediaUpdateMany.mockReset();
    mockDeleteFiles.mockReset();

    mockMediaFindMany.mockResolvedValue([
      { id: "media-1", storagePath: "media/image1.jpg" },
      { id: "media-2", storagePath: "media/image2.jpg" },
    ]);
    mockMediaUpdateMany.mockResolvedValue({ count: 2 });
    mockDeleteFiles.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("複数のメディアをまとめて削除できる", async () => {
      const result = await bulkDeleteMediaCommand(["media-1", "media-2"]);

      expect(result).toEqual({ deleted: 2 });
      expect(mockDeleteFiles).toHaveBeenCalledTimes(1);
      expect(mockMediaUpdateMany).toHaveBeenCalledTimes(1);
    });

    test("空配列を渡すと即座に deleted: 0 を返す", async () => {
      const result = await bulkDeleteMediaCommand([]);

      expect(result).toEqual({ deleted: 0 });
      expect(mockMediaFindMany).not.toHaveBeenCalled();
      expect(mockDeleteFiles).not.toHaveBeenCalled();
    });

    test("1件だけ削除できる", async () => {
      mockMediaFindMany.mockResolvedValue([
        { id: "media-1", storagePath: "media/image1.jpg" },
      ]);
      mockMediaUpdateMany.mockResolvedValue({ count: 1 });

      const result = await bulkDeleteMediaCommand(["media-1"]);

      expect(result).toEqual({ deleted: 1 });
    });

    test("deleteFiles に正しいパス一覧が渡される", async () => {
      await bulkDeleteMediaCommand(["media-1", "media-2"]);

      expect(mockDeleteFiles).toHaveBeenCalledWith(
        ["media/image1.jpg", "media/image2.jpg"],
        "media",
      );
    });

    test("updateMany が isActive: false で呼ばれる", async () => {
      await bulkDeleteMediaCommand(["media-1", "media-2"]);

      expect(mockMediaUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["media-1", "media-2"] } },
          data: { isActive: false },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("全 ID が存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockMediaFindMany.mockResolvedValue([]);

      await expect(
        bulkDeleteMediaCommand(["non-existent-1", "non-existent-2"]),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "削除対象が見つかりません",
      });
    });

    test("削除対象が見つからない場合はストレージ削除も updateMany も呼ばれない", async () => {
      mockMediaFindMany.mockResolvedValue([]);

      await expect(bulkDeleteMediaCommand(["non-existent"])).rejects.toThrow(
        DomainError,
      );

      expect(mockDeleteFiles).not.toHaveBeenCalled();
      expect(mockMediaUpdateMany).not.toHaveBeenCalled();
    });
  });
});
