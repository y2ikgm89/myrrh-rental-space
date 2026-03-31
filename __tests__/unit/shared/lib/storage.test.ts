/**
 * storage ユニットテスト
 *
 * src/shared/lib/storage.ts のテスト
 * Supabase クライアントをモックして各関数の動作を検証する
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// モック設定
// =============================================================================

// server-only 依存を回避
mock.module("server-only", () => ({}));

// logError / normalizeError をモック
const mockLogError = mock(
  (_error: unknown, _context?: unknown): void => undefined,
);
const mockNormalizeError = mock((err: unknown): Error => {
  if (err instanceof Error) return err;
  return new Error(String(err));
});

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  createErrorLogger: mock(() => ({
    error: mock(),
    warn: mock(),
    info: mock(),
  })),
  normalizeError: mockNormalizeError,
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  ReservationOverlapError: class extends Error {
    readonly code = "RESERVATION_OVERLAP" as const;
    constructor(message = "選択された時間帯は既に予約されています") {
      super(message);
      this.name = "ReservationOverlapError";
    }
  },
  isReservationOverlapError: (error: unknown) =>
    error instanceof Error && error.name === "ReservationOverlapError",
  safeFetch: mock(async (opts: { fetch: () => unknown; fallback: unknown }) => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  }),
  criticalFetch: mock(async (opts: { fetch: () => unknown }) => opts.fetch()),
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

// Supabase クライアントのモック
const mockUpload = mock(
  (): Promise<{
    data: { path: string } | null;
    error: { message: string } | null;
  }> => Promise.resolve({ data: { path: "test-path" }, error: null }),
);
const mockRemove = mock(
  (): Promise<{
    data: unknown[] | null;
    error: { message: string } | null;
  }> => Promise.resolve({ data: [], error: null }),
);
const mockGetPublicUrl = mock(() => ({
  data: {
    publicUrl:
      "https://example.supabase.co/storage/v1/object/public/spaces/test-path",
  },
}));

const mockFrom = mock(() => ({
  upload: mockUpload,
  remove: mockRemove,
  getPublicUrl: mockGetPublicUrl,
}));

const mockSupabase = {
  storage: {
    from: mockFrom,
  },
};

mock.module("@/shared/lib/supabase", () => ({
  supabase: mockSupabase,
  isSupabaseConfigured: mock(() => true),
  STORAGE_BUCKETS: {
    SPACES: "spaces",
    POSTS: "posts",
    SITE: "site",
    MEDIA: "media",
  },
}));

// =============================================================================
// テスト対象のインポート
// =============================================================================

import {
  uploadFile,
  uploadFiles,
  deleteFile,
  deleteFiles,
  uploadSpaceImage,
  uploadPostImage,
  uploadSiteImage,
  extractPathFromUrl,
  getPublicUrl,
} from "@/shared/lib/storage";

// =============================================================================
// ヘルパー: テスト用 File オブジェクト生成
// =============================================================================

function createTestFile(name: string, type: string, sizeBytes: number): File {
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

// =============================================================================
// uploadFile
// =============================================================================

describe("uploadFile", () => {
  beforeEach(() => {
    mock.restore();
    // restore後もモックを再設定する必要があるため、各テストでは
    // mockUpload / mockRemove / mockGetPublicUrl の実装を個別に設定する
    mockUpload.mockImplementation(() =>
      Promise.resolve({ data: { path: "test-path" }, error: null }),
    );
    mockGetPublicUrl.mockImplementation(() => ({
      data: {
        publicUrl:
          "https://example.supabase.co/storage/v1/object/public/spaces/test-path",
      },
    }));
  });

  describe("正常系", () => {
    test("有効な画像ファイルをアップロードして URL とパスを返す", async () => {
      const file = createTestFile("photo.jpg", "image/jpeg", 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(true);
      expect(result.url).toContain("spaces");
      expect(result.path).toBeDefined();
    });

    test("PNG ファイルも許可される", async () => {
      const file = createTestFile("image.png", "image/png", 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(true);
    });

    test("WebP ファイルも許可される", async () => {
      const file = createTestFile("image.webp", "image/webp", 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(true);
    });

    test("GIF ファイルも許可される", async () => {
      const file = createTestFile("image.gif", "image/gif", 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(true);
    });

    test("folder オプション付きでアップロードできる", async () => {
      const file = createTestFile("photo.jpg", "image/jpeg", 1024);
      const result = await uploadFile(file, "spaces", { folder: "space-123" });
      expect(result.success).toBe(true);
    });

    test("カスタム validation オプション付きでアップロードできる", async () => {
      const file = createTestFile("photo.jpg", "image/jpeg", 1024);
      const result = await uploadFile(file, "spaces", {
        validation: {
          maxSize: 10 * 1024 * 1024,
          allowedTypes: ["image/jpeg"],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("ファイルサイズが上限（5MB）を超える場合、エラーを返す", async () => {
      const file = createTestFile("large.jpg", "image/jpeg", 6 * 1024 * 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toContain("5MB");
    });

    test("未対応のファイル形式の場合、エラーを返す", async () => {
      const file = createTestFile("document.pdf", "application/pdf", 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toContain("対応していないファイル形式");
    });

    test("Supabase API がエラーを返した場合、失敗を返す", async () => {
      mockUpload.mockImplementation(() =>
        Promise.resolve({
          data: null,
          error: { message: "Storage quota exceeded" },
        }),
      );
      const file = createTestFile("photo.jpg", "image/jpeg", 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toBe("ファイルのアップロードに失敗しました");
    });

    test("Supabase クライアントが例外をスローした場合、失敗を返す", async () => {
      mockUpload.mockImplementation(() =>
        Promise.reject(new Error("Network error")),
      );
      const file = createTestFile("photo.jpg", "image/jpeg", 1024);
      const result = await uploadFile(file, "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toBe("ファイルのアップロードに失敗しました");
    });
  });

  describe("Supabase 未設定の場合", () => {
    test("isSupabaseConfigured が false の場合、設定エラーを返す", async () => {
      // supabase モジュールを未設定状態で再モック
      mock.module("@/shared/lib/supabase", () => ({
        supabase: null,
        isSupabaseConfigured: mock(() => false),
        STORAGE_BUCKETS: {
          SPACES: "spaces",
          POSTS: "posts",
          SITE: "site",
          MEDIA: "media",
        },
      }));

      const { uploadFile: uploadFileUnconfigured } =
        await import("@/shared/lib/storage");
      const file = createTestFile("photo.jpg", "image/jpeg", 1024);
      const result = await uploadFileUnconfigured(file, "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toBe("ファイルアップロード機能が設定されていません");
    });
  });
});

// =============================================================================
// uploadFiles（複数ファイル）
// =============================================================================

describe("uploadFiles", () => {
  beforeEach(() => {
    mock.restore();
    mockUpload.mockImplementation(() =>
      Promise.resolve({ data: { path: "test-path" }, error: null }),
    );
    mockGetPublicUrl.mockImplementation(() => ({
      data: {
        publicUrl:
          "https://example.supabase.co/storage/v1/object/public/spaces/test-path",
      },
    }));
    mock.module("@/shared/lib/supabase", () => ({
      supabase: mockSupabase,
      isSupabaseConfigured: mock(() => true),
      STORAGE_BUCKETS: {
        SPACES: "spaces",
        POSTS: "posts",
        SITE: "site",
        MEDIA: "media",
      },
    }));
  });

  describe("正常系", () => {
    test("複数の有効なファイルを全てアップロードして success: true を返す", async () => {
      const files = [
        createTestFile("photo1.jpg", "image/jpeg", 1024),
        createTestFile("photo2.png", "image/png", 2048),
      ];
      const result = await uploadFiles(files, "spaces");
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    test("空の配列を渡しても success: true を返す", async () => {
      const result = await uploadFiles([], "spaces");
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("異常系", () => {
    test("一つでも失敗すると success: false を返す", async () => {
      const files = [
        createTestFile("photo1.jpg", "image/jpeg", 1024),
        createTestFile("invalid.pdf", "application/pdf", 1024), // 不正なファイル形式
      ];
      const result = await uploadFiles(files, "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toContain("invalid.pdf");
    });
  });
});

// =============================================================================
// deleteFile
// =============================================================================

describe("deleteFile", () => {
  beforeEach(() => {
    mock.restore();
    mockRemove.mockImplementation(() =>
      Promise.resolve({ data: [], error: null }),
    );
    mock.module("@/shared/lib/supabase", () => ({
      supabase: mockSupabase,
      isSupabaseConfigured: mock(() => true),
      STORAGE_BUCKETS: {
        SPACES: "spaces",
        POSTS: "posts",
        SITE: "site",
        MEDIA: "media",
      },
    }));
  });

  describe("正常系", () => {
    test("有効なパスでファイルを削除して success: true を返す", async () => {
      const result = await deleteFile("space-1/timestamp-uuid.jpg", "spaces");
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe("異常系", () => {
    test("Supabase API がエラーを返した場合、失敗を返す", async () => {
      mockRemove.mockImplementation(() =>
        Promise.resolve({
          data: null,
          error: { message: "Object not found" },
        }),
      );
      const result = await deleteFile("nonexistent.jpg", "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toBe("ファイルの削除に失敗しました");
    });

    test("Supabase クライアントが例外をスローした場合、失敗を返す", async () => {
      mockRemove.mockImplementation(() =>
        Promise.reject(new Error("Network error")),
      );
      const result = await deleteFile("photo.jpg", "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toBe("ファイルの削除に失敗しました");
    });
  });
});

// =============================================================================
// deleteFiles（複数ファイル）
// =============================================================================

describe("deleteFiles", () => {
  beforeEach(() => {
    mock.restore();
    mockRemove.mockImplementation(() =>
      Promise.resolve({ data: [], error: null }),
    );
    mock.module("@/shared/lib/supabase", () => ({
      supabase: mockSupabase,
      isSupabaseConfigured: mock(() => true),
      STORAGE_BUCKETS: {
        SPACES: "spaces",
        POSTS: "posts",
        SITE: "site",
        MEDIA: "media",
      },
    }));
  });

  describe("正常系", () => {
    test("複数パスのファイルを一括削除して success: true を返す", async () => {
      const paths = ["space-1/file1.jpg", "space-1/file2.png"];
      const result = await deleteFiles(paths, "spaces");
      expect(result.success).toBe(true);
    });

    test("空の配列でも success: true を返す", async () => {
      const result = await deleteFiles([], "spaces");
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("Supabase API がエラーを返した場合、失敗を返す", async () => {
      mockRemove.mockImplementation(() =>
        Promise.resolve({
          data: null,
          error: { message: "Batch delete failed" },
        }),
      );
      const result = await deleteFiles(["file1.jpg", "file2.jpg"], "spaces");
      expect(result.success).toBe(false);
      expect(result.error).toBe("ファイルの削除に失敗しました");
    });
  });
});

// =============================================================================
// uploadSpaceImage
// =============================================================================

describe("uploadSpaceImage", () => {
  beforeEach(() => {
    mock.restore();
    mockUpload.mockImplementation(() =>
      Promise.resolve({ data: { path: "test-path" }, error: null }),
    );
    mockGetPublicUrl.mockImplementation(() => ({
      data: {
        publicUrl:
          "https://example.supabase.co/storage/v1/object/public/spaces/space-1/test-path.jpg",
      },
    }));
    mock.module("@/shared/lib/supabase", () => ({
      supabase: mockSupabase,
      isSupabaseConfigured: mock(() => true),
      STORAGE_BUCKETS: {
        SPACES: "spaces",
        POSTS: "posts",
        SITE: "site",
        MEDIA: "media",
      },
    }));
  });

  test("スペース画像として spaces バケットにアップロードする", async () => {
    const file = createTestFile("space-photo.jpg", "image/jpeg", 1024);
    const result = await uploadSpaceImage(file, "space-123");
    expect(result.success).toBe(true);
  });

  test("10MB 以下の画像は許可される（IMAGE_VALIDATION: maxSize=10MB）", async () => {
    const file = createTestFile(
      "large-image.jpg",
      "image/jpeg",
      9 * 1024 * 1024,
    );
    const result = await uploadSpaceImage(file, "space-123");
    expect(result.success).toBe(true);
  });

  test("10MB を超える画像はエラーを返す", async () => {
    const file = createTestFile(
      "too-large.jpg",
      "image/jpeg",
      11 * 1024 * 1024,
    );
    const result = await uploadSpaceImage(file, "space-123");
    expect(result.success).toBe(false);
    expect(result.error).toContain("10MB");
  });
});

// =============================================================================
// uploadPostImage
// =============================================================================

describe("uploadPostImage", () => {
  beforeEach(() => {
    mock.restore();
    mockUpload.mockImplementation(() =>
      Promise.resolve({ data: { path: "test-path" }, error: null }),
    );
    mockGetPublicUrl.mockImplementation(() => ({
      data: {
        publicUrl:
          "https://example.supabase.co/storage/v1/object/public/posts/general/test-path.jpg",
      },
    }));
    mock.module("@/shared/lib/supabase", () => ({
      supabase: mockSupabase,
      isSupabaseConfigured: mock(() => true),
      STORAGE_BUCKETS: {
        SPACES: "spaces",
        POSTS: "posts",
        SITE: "site",
        MEDIA: "media",
      },
    }));
  });

  test("postId 指定でそのフォルダにアップロードする", async () => {
    const file = createTestFile("post-image.jpg", "image/jpeg", 1024);
    const result = await uploadPostImage(file, "post-456");
    expect(result.success).toBe(true);
  });

  test("postId 未指定の場合、general フォルダにアップロードする", async () => {
    const file = createTestFile("post-image.jpg", "image/jpeg", 1024);
    const result = await uploadPostImage(file);
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// uploadSiteImage
// =============================================================================

describe("uploadSiteImage", () => {
  beforeEach(() => {
    mock.restore();
    mockUpload.mockImplementation(() =>
      Promise.resolve({ data: { path: "test-path" }, error: null }),
    );
    mockGetPublicUrl.mockImplementation(() => ({
      data: {
        publicUrl:
          "https://example.supabase.co/storage/v1/object/public/site/logo/test-path.png",
      },
    }));
    mock.module("@/shared/lib/supabase", () => ({
      supabase: mockSupabase,
      isSupabaseConfigured: mock(() => true),
      STORAGE_BUCKETS: {
        SPACES: "spaces",
        POSTS: "posts",
        SITE: "site",
        MEDIA: "media",
      },
    }));
  });

  describe("logo タイプ", () => {
    test("JPEG/PNG/WebP/SVG が許可される", async () => {
      for (const [name, type] of [
        ["logo.jpg", "image/jpeg"],
        ["logo.png", "image/png"],
        ["logo.webp", "image/webp"],
        ["logo.svg", "image/svg+xml"],
      ]) {
        const file = createTestFile(name, type, 1024);
        const result = await uploadSiteImage(file, "logo");
        expect(result.success).toBe(true);
      }
    });

    test("2MB を超えるファイルはエラーを返す", async () => {
      const file = createTestFile("logo.jpg", "image/jpeg", 3 * 1024 * 1024);
      const result = await uploadSiteImage(file, "logo");
      expect(result.success).toBe(false);
      expect(result.error).toContain("2MB");
    });
  });

  describe("favicon タイプ", () => {
    test("ICO/PNG/SVG が許可される", async () => {
      for (const [name, type] of [
        ["favicon.ico", "image/x-icon"],
        ["favicon.png", "image/png"],
        ["favicon.svg", "image/svg+xml"],
      ]) {
        const file = createTestFile(name, type, 1024);
        const result = await uploadSiteImage(file, "favicon");
        expect(result.success).toBe(true);
      }
    });

    test("favicon は JPEG が許可されない", async () => {
      const file = createTestFile("favicon.jpg", "image/jpeg", 1024);
      const result = await uploadSiteImage(file, "favicon");
      expect(result.success).toBe(false);
      expect(result.error).toContain("対応していないファイル形式");
    });
  });

  describe("ogp タイプ", () => {
    test("JPEG/PNG/WebP/SVG が許可される", async () => {
      for (const [name, type] of [
        ["ogp.jpg", "image/jpeg"],
        ["ogp.png", "image/png"],
        ["ogp.webp", "image/webp"],
        ["ogp.svg", "image/svg+xml"],
      ]) {
        const file = createTestFile(name, type, 1024);
        const result = await uploadSiteImage(file, "ogp");
        expect(result.success).toBe(true);
      }
    });
  });
});

// =============================================================================
// extractPathFromUrl
// =============================================================================

describe("extractPathFromUrl", () => {
  describe("正常系", () => {
    test("spaces バケットの URL からパスを抽出する", () => {
      const url =
        "https://example.supabase.co/storage/v1/object/public/spaces/space-1/timestamp-uuid.jpg";
      const result = extractPathFromUrl(url, "spaces");
      expect(result).toBe("space-1/timestamp-uuid.jpg");
    });

    test("posts バケットの URL からパスを抽出する", () => {
      const url =
        "https://example.supabase.co/storage/v1/object/public/posts/general/image.png";
      const result = extractPathFromUrl(url, "posts");
      expect(result).toBe("general/image.png");
    });

    test("site バケットの URL からパスを抽出する", () => {
      const url =
        "https://example.supabase.co/storage/v1/object/public/site/logo/my-logo.svg";
      const result = extractPathFromUrl(url, "site");
      expect(result).toBe("logo/my-logo.svg");
    });

    test("ネストしたパスも正しく抽出する", () => {
      const url =
        "https://example.supabase.co/storage/v1/object/public/spaces/folder/sub/file.jpg";
      const result = extractPathFromUrl(url, "spaces");
      expect(result).toBe("folder/sub/file.jpg");
    });
  });

  describe("異常系", () => {
    test("バケット名が一致しない URL では null を返す", () => {
      const url =
        "https://example.supabase.co/storage/v1/object/public/spaces/file.jpg";
      const result = extractPathFromUrl(url, "posts");
      expect(result).toBeNull();
    });

    test("Supabase Storage の URL 形式でない場合は null を返す", () => {
      const result = extractPathFromUrl(
        "https://example.com/image.jpg",
        "spaces",
      );
      expect(result).toBeNull();
    });

    test("空文字列では null を返す", () => {
      const result = extractPathFromUrl("", "spaces");
      expect(result).toBeNull();
    });
  });
});
