import { describe, test, expect, mock, beforeEach } from "bun:test";

// mock @aws-sdk/client-s3 before importing upload module
const sendMock = mock(async () => ({ ETag: '"abc123"' }));
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    NODE_ENV: "test",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET_NAME: "test-bucket",
    R2_PUBLIC_URL: "https://media.test.example.com",
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => {}),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  uploadFile,
  uploadFiles,
  validateFile,
  DEFAULT_VALIDATION,
  IMAGE_VALIDATION,
} from "@/shared/lib/r2/upload";
import { STORAGE_PREFIXES } from "@/shared/lib/r2/keys";

function makeFile(name: string, type: string, size: number): File {
  const buf = new Uint8Array(size).fill(0);
  return new File([buf], name, { type });
}

beforeEach(() => {
  sendMock.mockClear();
});

describe("validateFile", () => {
  test("サイズが上限を超えるとエラー", () => {
    const file = makeFile("big.jpg", "image/jpeg", 20 * 1024 * 1024);
    const err = validateFile(file, IMAGE_VALIDATION);
    expect(err).toContain("MB以下");
  });

  test("未対応 MIME はエラー", () => {
    const file = makeFile("doc.pdf", "application/pdf", 1024);
    const err = validateFile(file, IMAGE_VALIDATION);
    expect(err).toContain("対応していないファイル形式");
  });

  test("OK なファイルは null", () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    expect(validateFile(file, IMAGE_VALIDATION)).toBeNull();
  });
});

describe("uploadFile", () => {
  test("成功時は url + path を返し S3Client.send を呼ぶ", async () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.SPACES, {
      folder: "space-1",
    });
    expect(result.success).toBe(true);
    expect(result.path).toMatch(/^spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/);
    expect(result.url).toMatch(
      /^https:\/\/media\.test\.example\.com\/spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/,
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("サイズ超過ファイルは success:false で send されない", async () => {
    const file = makeFile("big.jpg", "image/jpeg", 20 * 1024 * 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(false);
    expect(result.error).toContain("MB以下");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("S3Client.send が throw したら success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(false);
    expect(result.error).toContain("アップロードに失敗");
  });
});

describe("uploadFiles", () => {
  test("2 件順次アップロード", async () => {
    const files = [
      makeFile("a.jpg", "image/jpeg", 1024),
      makeFile("b.png", "image/png", 1024),
    ];
    const result = await uploadFiles(files, STORAGE_PREFIXES.POSTS, {
      folder: "post-1",
    });
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  test("途中で失敗したら success:false で短絡", async () => {
    const files = [
      makeFile("a.jpg", "image/jpeg", 1024),
      makeFile("big.jpg", "image/jpeg", 20 * 1024 * 1024),
      makeFile("c.png", "image/png", 1024),
    ];
    const result = await uploadFiles(files, STORAGE_PREFIXES.POSTS);
    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(2); // 最初の1件成功 + 2件目失敗で短絡
    expect(result.error).toContain("big.jpg");
  });
});

describe("DEFAULT_VALIDATION / IMAGE_VALIDATION", () => {
  test("DEFAULT は 5MB / 画像のみ", () => {
    expect(DEFAULT_VALIDATION.maxSize).toBe(5 * 1024 * 1024);
    expect(DEFAULT_VALIDATION.allowedTypes).toContain("image/jpeg");
  });

  test("IMAGE は 10MB / 画像のみ", () => {
    expect(IMAGE_VALIDATION.maxSize).toBe(10 * 1024 * 1024);
    expect(IMAGE_VALIDATION.allowedTypes).toContain("image/webp");
  });
});
