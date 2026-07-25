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

const mockAssertMediaUrlNotInUse = mock<() => Promise<void>>(() =>
  Promise.resolve(),
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

mock.module("@/shared/domain/media/references", () => ({
  assertMediaUrlNotInUse: (
    ...args: Parameters<typeof mockAssertMediaUrlNotInUse>
  ) => mockAssertMediaUrlNotInUse(...args),
  findMediaUrlUsages: mock(() => Promise.resolve([])),
}));

// r2 モック（discriminated union: success: true → url/path/contentType, false → error）
type MockUploadResult =
  | {
      success: true;
      url: string;
      path: string;
      contentType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
      width?: number | null;
      height?: number | null;
    }
  | { success: false; error: string };

const MOCK_MEDIA_VALIDATION = {
  allowedTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "application/pdf",
  ],
} as const;

const mockUploadFile = mock<(...args: unknown[]) => Promise<MockUploadResult>>(
  () =>
    Promise.resolve({
      success: true,
      url: "https://media.test.example.com/media/folder/x.jpg",
      path: "media/folder/x.jpg",
      contentType: "image/jpeg",
    }),
);
const mockDeleteFile = mock<() => Promise<{ success: boolean }>>(() =>
  Promise.resolve({ success: true }),
);
const mockDeleteFiles = mock<() => Promise<{ success: boolean }>>(() =>
  Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/r2/upload", () => ({
  MEDIA_VALIDATION: MOCK_MEDIA_VALIDATION,
  uploadFile: mockUploadFile,
}));
mock.module("@/shared/lib/r2/delete", () => ({
  deleteFile: mockDeleteFile,
  deleteFiles: mockDeleteFiles,
}));
mock.module("@/shared/lib/r2/keys", () => ({
  STORAGE_PREFIXES: {
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
  url: MEDIA_URL,
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
      contentType: "image/jpeg",
      width: 1280,
      height: 720,
    });
    mockMediaCreate.mockResolvedValue({ id: MEDIA_ID, url: MEDIA_URL });
  });

  describe("正常系", () => {
    test("ファイルをアップロードして media レコードを作成できる", async () => {
      const result = await uploadMediaCommand(UPLOAD_INPUT);

      expect(result).toEqual({ id: MEDIA_ID, url: MEDIA_URL });
      expect(mockUploadFile).toHaveBeenCalledTimes(1);
      expect(mockUploadFile).toHaveBeenCalledWith(MOCK_FILE, "media", {
        folder: "media",
        validation: MOCK_MEDIA_VALIDATION,
      });
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
            width: 1280,
            height: 720,
            uploadedBy: USER_ID,
          }),
        }),
      );
    });

    test("upload 結果に width/height が無い場合は null で保存する", async () => {
      mockUploadFile.mockResolvedValue({
        success: true,
        url: MEDIA_URL,
        path: STORAGE_PATH,
        contentType: "image/jpeg",
      });

      await uploadMediaCommand(UPLOAD_INPUT);

      expect(mockMediaCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            width: null,
            height: null,
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

    test("ストレージアップロードが失敗（エラーメッセージ空文字）でも DomainError をスローする", async () => {
      mockUploadFile.mockResolvedValue({
        success: false,
        error: "",
      });

      await expect(uploadMediaCommand(UPLOAD_INPUT)).rejects.toMatchObject({
        code: "UNEXPECTED",
        message: "アップロードに失敗しました",
      });
    });

    test("upload が success: false を返した場合 DomainError をスローする", async () => {
      // 新 API は discriminated union により success: true 時は url/path/contentType
      // 必須（型レベル強制）。ランタイムで失敗を表現する canonical は success: false。
      mockUploadFile.mockResolvedValue({
        success: false,
        error: "署名検証失敗",
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

      expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_PATH);
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
    mockAssertMediaUrlNotInUse.mockReset();

    mockMediaFindUnique.mockResolvedValue(EXISTING_MEDIA_WITH_PATH);
    mockMediaUpdate.mockResolvedValue({ id: MEDIA_ID });
    mockDeleteFile.mockResolvedValue({ success: true });
    mockAssertMediaUrlNotInUse.mockResolvedValue(undefined);
  });

  describe("正常系", () => {
    test("メディアをソフトデリートできる", async () => {
      await deleteMediaCommand(MEDIA_ID);

      expect(mockAssertMediaUrlNotInUse).toHaveBeenCalledWith(MEDIA_URL);
      expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_PATH);
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
      expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_PATH);
    });

    test("成功時は { id, url } を返す", async () => {
      const result = await deleteMediaCommand(MEDIA_ID);

      expect(result).toEqual({ id: MEDIA_ID, url: MEDIA_URL });
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

      expect(mockAssertMediaUrlNotInUse).not.toHaveBeenCalled();
      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(mockMediaUpdate).not.toHaveBeenCalled();
    });

    test("参照中 URL は CONFLICT で削除せず deleteFile も呼ばない", async () => {
      mockAssertMediaUrlNotInUse.mockRejectedValue(
        new DomainError(
          "このメディアは使用中のため削除できません（投稿: hello）",
          "CONFLICT",
        ),
      );

      await expect(deleteMediaCommand(MEDIA_ID)).rejects.toMatchObject({
        code: "CONFLICT",
      });

      expect(mockDeleteFile).not.toHaveBeenCalled();
      expect(mockMediaUpdate).not.toHaveBeenCalled();
    });

    test("deleteFile 失敗時は UNEXPECTED で DB を更新しない", async () => {
      mockDeleteFile.mockResolvedValue({ success: false });

      await expect(deleteMediaCommand(MEDIA_ID)).rejects.toMatchObject({
        code: "UNEXPECTED",
      });

      expect(mockMediaUpdate).not.toHaveBeenCalled();
    });
  });
});
