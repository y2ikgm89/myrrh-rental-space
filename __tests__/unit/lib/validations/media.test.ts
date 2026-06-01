/**
 * メディアバリデーションテスト
 *
 * src/lib/validations/media.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import {
  mediaUploadSchema,
  mediaUpdateSchema,
  mediaFiltersSchema,
  mediaPaginationSchema,
  inferMediaType,
  isAllowedMimeType,
  isAllowedFileSize,
  validateFile,
  parseMediaTypeFilter,
  parseMediaUsageFilter,
  parseMediaUploadFormData,
  parseMediaTagsInput,
  ALLOWED_MIME_TYPES,
} from "@/admin/lib/validations/media";

describe("mediaUploadSchema", () => {
  describe("正常系", () => {
    test("最小限のデータは検証を通過", () => {
      const result = mediaUploadSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.usage).toBe("GENERAL");
        expect(result.data.tags).toEqual([]);
      }
    });

    test("全フィールド指定も許可（type は server-side で派生するため未受領）", () => {
      const result = mediaUploadSchema.safeParse({
        usage: "POST",
        alt: "代替テキスト",
        title: "タイトル",
        description: "説明",
        tags: ["tag1", "tag2"],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("usage", () => {
    test("有効なMediaUsage値は許可", () => {
      const validUsages = ["GENERAL", "POST", "SPACE", "NEWS", "PAGE", "SITE"];

      for (const usage of validUsages) {
        const result = mediaUploadSchema.safeParse({ usage });
        expect(result.success).toBe(true);
      }
    });

    test("無効なusage値はエラー", () => {
      const result = mediaUploadSchema.safeParse({ usage: "INVALID" });
      expect(result.success).toBe(false);
    });
  });

  describe("alt", () => {
    test("200文字超過はエラー", () => {
      const result = mediaUploadSchema.safeParse({ alt: "あ".repeat(201) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("200文字以内");
      }
    });

    test("200文字ちょうどは許可", () => {
      const result = mediaUploadSchema.safeParse({ alt: "あ".repeat(200) });
      expect(result.success).toBe(true);
    });
  });

  describe("title", () => {
    test("100文字超過はエラー", () => {
      const result = mediaUploadSchema.safeParse({ title: "あ".repeat(101) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("100文字以内");
      }
    });

    test("100文字ちょうどは許可", () => {
      const result = mediaUploadSchema.safeParse({ title: "あ".repeat(100) });
      expect(result.success).toBe(true);
    });
  });

  describe("description", () => {
    test("500文字超過はエラー", () => {
      const result = mediaUploadSchema.safeParse({
        description: "あ".repeat(501),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("500文字以内");
      }
    });

    test("500文字ちょうどは許可", () => {
      const result = mediaUploadSchema.safeParse({
        description: "あ".repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("tags", () => {
    test("空配列は許可", () => {
      const result = mediaUploadSchema.safeParse({ tags: [] });
      expect(result.success).toBe(true);
    });

    test("11個以上はエラー", () => {
      const result = mediaUploadSchema.safeParse({
        tags: Array(11).fill("tag"),
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("最大10個");
      }
    });

    test("50文字超過のタグはエラー", () => {
      const result = mediaUploadSchema.safeParse({
        tags: ["a".repeat(51)],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("50文字以内");
      }
    });
  });
});

describe("mediaUpdateSchema", () => {
  describe("正常系", () => {
    test("空オブジェクトは許可", () => {
      const result = mediaUpdateSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    test("全フィールド指定も許可", () => {
      const result = mediaUpdateSchema.safeParse({
        alt: "代替テキスト",
        title: "タイトル",
        description: "説明",
        tags: ["tag1"],
        usage: "POST",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("alt", () => {
    test("200文字超過はエラー", () => {
      const result = mediaUpdateSchema.safeParse({ alt: "あ".repeat(201) });
      expect(result.success).toBe(false);
    });
  });

  describe("title", () => {
    test("100文字超過はエラー", () => {
      const result = mediaUpdateSchema.safeParse({ title: "あ".repeat(101) });
      expect(result.success).toBe(false);
    });
  });

  describe("description", () => {
    test("500文字超過はエラー", () => {
      const result = mediaUpdateSchema.safeParse({
        description: "あ".repeat(501),
      });
      expect(result.success).toBe(false);
    });
  });

  describe("tags", () => {
    test("11個以上はエラー", () => {
      const result = mediaUpdateSchema.safeParse({
        tags: Array(11).fill("tag"),
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("mediaFiltersSchema", () => {
  test("空オブジェクトは許可", () => {
    const result = mediaFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("全フィールド指定も許可", () => {
    const result = mediaFiltersSchema.safeParse({
      type: "IMAGE",
      usage: "POST",
      search: "keyword",
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(true);
  });

  test("無効なtype値はエラー", () => {
    const result = mediaFiltersSchema.safeParse({ type: "INVALID" });
    expect(result.success).toBe(false);
  });

  test("無効なusage値はエラー", () => {
    const result = mediaFiltersSchema.safeParse({ usage: "INVALID" });
    expect(result.success).toBe(false);
  });
});

describe("mediaPaginationSchema", () => {
  test("空オブジェクトはデフォルト値が適用", () => {
    const result = mediaPaginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(24);
    }
  });

  test("page 0はエラー", () => {
    const result = mediaPaginationSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  test("limit 0はエラー", () => {
    const result = mediaPaginationSchema.safeParse({ limit: 0 });
    expect(result.success).toBe(false);
  });

  test("limit 101はエラー", () => {
    const result = mediaPaginationSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  test("有効な値は許可", () => {
    const result = mediaPaginationSchema.safeParse({ page: 5, limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(5);
      expect(result.data.limit).toBe(50);
    }
  });
});

describe("inferMediaType", () => {
  test("image/* は IMAGE を返す", () => {
    expect(inferMediaType("image/jpeg")).toBe("IMAGE");
    expect(inferMediaType("image/png")).toBe("IMAGE");
    expect(inferMediaType("image/webp")).toBe("IMAGE");
    expect(inferMediaType("image/gif")).toBe("IMAGE");
  });

  test("video/* は VIDEO を返す", () => {
    expect(inferMediaType("video/mp4")).toBe("VIDEO");
    expect(inferMediaType("video/webm")).toBe("VIDEO");
  });

  test("application/pdf は DOCUMENT を返す", () => {
    expect(inferMediaType("application/pdf")).toBe("DOCUMENT");
  });

  test("その他は OTHER を返す", () => {
    expect(inferMediaType("application/json")).toBe("OTHER");
    expect(inferMediaType("text/plain")).toBe("OTHER");
  });
});

describe("isAllowedMimeType", () => {
  describe("IMAGE", () => {
    test("許可されたMIMEタイプはtrue (SVG / quicktime は server-side 拒否のため除外済)", () => {
      expect(isAllowedMimeType("image/jpeg", "IMAGE")).toBe(true);
      expect(isAllowedMimeType("image/png", "IMAGE")).toBe(true);
      expect(isAllowedMimeType("image/webp", "IMAGE")).toBe(true);
      expect(isAllowedMimeType("image/gif", "IMAGE")).toBe(true);
    });

    test("SVG / 非対応 MIME は false (magic-byte 検証で reject される)", () => {
      expect(isAllowedMimeType("image/svg+xml", "IMAGE")).toBe(false);
      expect(isAllowedMimeType("image/bmp", "IMAGE")).toBe(false);
      expect(isAllowedMimeType("video/mp4", "IMAGE")).toBe(false);
    });
  });

  describe("VIDEO", () => {
    test("許可されたMIMEタイプはtrue (quicktime は server-side 拒否)", () => {
      expect(isAllowedMimeType("video/mp4", "VIDEO")).toBe(true);
      expect(isAllowedMimeType("video/webm", "VIDEO")).toBe(true);
    });

    test("quicktime / 他形式は false", () => {
      expect(isAllowedMimeType("video/quicktime", "VIDEO")).toBe(false);
      expect(isAllowedMimeType("video/avi", "VIDEO")).toBe(false);
    });
  });

  describe("DOCUMENT", () => {
    test("許可されたMIMEタイプはtrue", () => {
      expect(isAllowedMimeType("application/pdf", "DOCUMENT")).toBe(true);
    });

    test("許可されていないMIMEタイプはfalse", () => {
      expect(isAllowedMimeType("application/msword", "DOCUMENT")).toBe(false);
    });
  });

  describe("AUDIO", () => {
    test("AUDIO に登録された audio MIME のみ許可（その他は拒否）", () => {
      expect(isAllowedMimeType("audio/mpeg", "AUDIO")).toBe(true);
      expect(isAllowedMimeType("audio/wav", "AUDIO")).toBe(true);
      expect(isAllowedMimeType("text/plain", "AUDIO")).toBe(false);
      expect(isAllowedMimeType("application/octet-stream", "AUDIO")).toBe(
        false,
      );
    });
  });

  describe("type指定なし", () => {
    test("MIMEタイプから自動推定", () => {
      expect(isAllowedMimeType("image/jpeg")).toBe(true);
      expect(isAllowedMimeType("video/mp4")).toBe(true);
      expect(isAllowedMimeType("application/pdf")).toBe(true);
    });
  });
});

describe("isAllowedFileSize", () => {
  test("IMAGE: 5MB以下は許可", () => {
    expect(isAllowedFileSize(5 * 1024 * 1024, "IMAGE")).toBe(true);
    expect(isAllowedFileSize(5 * 1024 * 1024 + 1, "IMAGE")).toBe(false);
  });

  test("VIDEO: 50MB以下は許可", () => {
    expect(isAllowedFileSize(50 * 1024 * 1024, "VIDEO")).toBe(true);
    expect(isAllowedFileSize(50 * 1024 * 1024 + 1, "VIDEO")).toBe(false);
  });

  test("DOCUMENT: 10MB以下は許可", () => {
    expect(isAllowedFileSize(10 * 1024 * 1024, "DOCUMENT")).toBe(true);
    expect(isAllowedFileSize(10 * 1024 * 1024 + 1, "DOCUMENT")).toBe(false);
  });

  test("AUDIO: 20MB以下は許可", () => {
    expect(isAllowedFileSize(20 * 1024 * 1024, "AUDIO")).toBe(true);
    expect(isAllowedFileSize(20 * 1024 * 1024 + 1, "AUDIO")).toBe(false);
  });
});

describe("constants", () => {
  test("ALLOWED_MIME_TYPES が AUDIO enum を canonical で表現する (Phase 4 で AUDIO 派生済)", () => {
    expect(ALLOWED_MIME_TYPES.IMAGE).toContain("image/jpeg");
    expect(ALLOWED_MIME_TYPES.IMAGE).toContain("image/png");
    expect(ALLOWED_MIME_TYPES.VIDEO).toContain("video/mp4");
    expect(ALLOWED_MIME_TYPES.AUDIO).toContain("audio/mpeg");
    expect(ALLOWED_MIME_TYPES.AUDIO).toContain("audio/wav");
    expect(ALLOWED_MIME_TYPES.DOCUMENT).toContain("application/pdf");
    expect(ALLOWED_MIME_TYPES.OTHER).toEqual([]);
  });
});

// =============================================================================
// validateFile
// =============================================================================

describe("validateFile", () => {
  /**
   * テスト用のFile-likeオブジェクトを作成するヘルパー
   * ブラウザ環境のFileコンストラクタに依存しないようにする
   */
  function createMockFile(name: string, type: string, size: number): File {
    const blob = new Blob(["x".repeat(size)], { type });
    return new File([blob], name, { type });
  }

  describe("正常系", () => {
    test("許可されたJPEG画像はvalidを返す", () => {
      const file = createMockFile("test.jpg", "image/jpeg", 1024);
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    test("許可されたPNG画像はvalidを返す", () => {
      const file = createMockFile("test.png", "image/png", 1024);
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    test("許可されたPDFはvalidを返す", () => {
      const file = createMockFile("doc.pdf", "application/pdf", 1024);
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    test("許可されたMP4動画はvalidを返す", () => {
      const file = createMockFile("video.mp4", "video/mp4", 1024);
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe("MIMEタイプエラー", () => {
    test("許可されていないMIMEタイプはエラーを返す", () => {
      const file = createMockFile("test.bmp", "image/bmp", 1024);
      const result = validateFile(file, "IMAGE");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("対応していないファイル形式");
      }
    });
  });

  describe("ファイルサイズエラー", () => {
    test("IMAGEの5MB超過はエラーを返す", () => {
      const file = createMockFile(
        "large.jpg",
        "image/jpeg",
        5 * 1024 * 1024 + 1,
      );
      const result = validateFile(file, "IMAGE");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("5MB以下");
      }
    });
  });

  describe("type指定", () => {
    test("type指定ありで正しいMIMEタイプはvalid", () => {
      const file = createMockFile("test.jpg", "image/jpeg", 1024);
      const result = validateFile(file, "IMAGE");
      expect(result.valid).toBe(true);
    });

    test("type指定なしでMIMEタイプから自動推定", () => {
      const file = createMockFile("test.jpg", "image/jpeg", 1024);
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });
  });
});

// =============================================================================
// parseMediaTypeFilter
// =============================================================================

describe("parseMediaTypeFilter", () => {
  test("有効なMediaType値はそのまま返す", () => {
    expect(parseMediaTypeFilter("IMAGE")).toBe("IMAGE");
    expect(parseMediaTypeFilter("VIDEO")).toBe("VIDEO");
    expect(parseMediaTypeFilter("DOCUMENT")).toBe("DOCUMENT");
    expect(parseMediaTypeFilter("OTHER")).toBe("OTHER");
  });

  test("無効な値はundefinedを返す", () => {
    expect(parseMediaTypeFilter("INVALID")).toBeUndefined();
    expect(parseMediaTypeFilter("image")).toBeUndefined();
  });

  test("null/undefined/空文字はundefinedを返す", () => {
    expect(parseMediaTypeFilter(null)).toBeUndefined();
    expect(parseMediaTypeFilter(undefined)).toBeUndefined();
    expect(parseMediaTypeFilter("")).toBeUndefined();
  });
});

// =============================================================================
// parseMediaUsageFilter
// =============================================================================

describe("parseMediaUsageFilter", () => {
  test("有効なMediaUsage値はそのまま返す", () => {
    expect(parseMediaUsageFilter("POST")).toBe("POST");
    expect(parseMediaUsageFilter("NEWS")).toBe("NEWS");
    expect(parseMediaUsageFilter("PAGE")).toBe("PAGE");
    expect(parseMediaUsageFilter("SPACE")).toBe("SPACE");
    expect(parseMediaUsageFilter("SITE")).toBe("SITE");
    expect(parseMediaUsageFilter("GENERAL")).toBe("GENERAL");
  });

  test("無効な値はundefinedを返す", () => {
    expect(parseMediaUsageFilter("INVALID")).toBeUndefined();
    expect(parseMediaUsageFilter("post")).toBeUndefined();
  });

  test("null/undefined/空文字はundefinedを返す", () => {
    expect(parseMediaUsageFilter(null)).toBeUndefined();
    expect(parseMediaUsageFilter(undefined)).toBeUndefined();
    expect(parseMediaUsageFilter("")).toBeUndefined();
  });
});

describe("parseMediaTagsInput", () => {
  test("未指定は空配列を返す", () => {
    const result = parseMediaTagsInput(undefined);
    expect(result).toEqual({ success: true, data: [] });
  });

  test("有効な JSON 配列は文字列配列として返す", () => {
    const result = parseMediaTagsInput('["tag1","tag2"]');
    expect(result).toEqual({ success: true, data: ["tag1", "tag2"] });
  });

  test("不正な JSON はエラーを返す", () => {
    const result = parseMediaTagsInput('["tag1"');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("JSON");
    }
  });

  test("文字列配列以外はエラーを返す", () => {
    const result = parseMediaTagsInput('{"tag":"value"}');
    expect(result.success).toBe(false);
  });
});

describe("parseMediaUploadFormData", () => {
  test("有効な form data を file と metadata に分解する", () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    );
    formData.append("usage", "GENERAL");
    formData.append("tags", '["hero"]');

    const result = parseMediaUploadFormData(formData);
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.data.file.name).toBe("photo.jpg");
      expect(result.data.metadata.usage).toBe("GENERAL");
      expect(result.data.metadata.tags).toEqual(["hero"]);
    }
  });

  test("file がない場合は error を返す", () => {
    const result = parseMediaUploadFormData(new FormData());
    expect(result).toEqual({
      kind: "error",
      error: "ファイルが選択されていません",
    });
  });

  test("tags が不正な JSON の場合は error を返す", () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    );
    formData.append("tags", '["hero"');

    const result = parseMediaUploadFormData(formData);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error).toContain("JSON");
    }
  });

  test("metadata が不正な場合は validation-error を返す", () => {
    const formData = new FormData();
    formData.append(
      "file",
      new File(["image"], "photo.jpg", { type: "image/jpeg" }),
    );
    formData.append("title", "a".repeat(101));

    const result = parseMediaUploadFormData(formData);
    expect(result.kind).toBe("validation-error");
  });
});
