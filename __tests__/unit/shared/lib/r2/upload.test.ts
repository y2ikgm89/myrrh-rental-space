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
  DEFAULT_VALIDATION,
  IMAGE_VALIDATION,
} from "@/shared/lib/r2/upload";
import { STORAGE_PREFIXES } from "@/shared/lib/r2/keys";

// Magic-byte signatures (12 bytes) for each supported MIME
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const WEBP_HEADER = [
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
];

function makeImageFile(
  name: string,
  declaredType: string,
  signature: number[],
  size = 1024,
): File {
  const buf = new Uint8Array(size);
  signature.forEach((b, i) => {
    buf[i] = b;
  });
  return new File([buf], name, { type: declaredType });
}

function makeRawFile(name: string, declaredType: string, size: number): File {
  // signature なし → magic-byte 検出失敗
  const buf = new Uint8Array(size).fill(0);
  return new File([buf], name, { type: declaredType });
}

beforeEach(() => {
  sendMock.mockClear();
});

describe("uploadFile (magic-byte trust boundary)", () => {
  test("JPEG: signature 検出成功で url + path + contentType を返す", async () => {
    const file = makeImageFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.SPACES, {
      folder: "space-1",
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.contentType).toBe("image/jpeg");
    expect(result.path).toMatch(/^spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/);
    expect(result.url).toMatch(
      /^https:\/\/media\.test\.example\.com\/spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/,
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("PNG: 検出 MIME 由来の拡張子になる（client.type が偽装でも server-side で確定）", async () => {
    // declaredType を image/jpeg と偽装するが、magic-byte は PNG
    const file = makeImageFile("evil.jpg", "image/jpeg", PNG_HEADER, 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.contentType).toBe("image/png");
    expect(result.path).toMatch(/\.png$/);
  });

  test("WebP: 検出 MIME 由来の拡張子", async () => {
    const file = makeImageFile("photo.webp", "image/webp", WEBP_HEADER, 2048);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.contentType).toBe("image/webp");
    expect(result.path).toMatch(/\.webp$/);
  });

  test("magic-byte が画像でない（HTML 偽装）→ success:false で send されない", async () => {
    const file = makeRawFile("evil.jpg", "image/jpeg", 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("認識できません");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("検出 MIME が allowedTypes に含まれない → 拒否", async () => {
    // PNG signature だが allowedTypes に PNG を含めない
    const file = makeImageFile("photo.png", "image/png", PNG_HEADER, 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA, {
      validation: {
        maxSize: 5 * 1024 * 1024,
        allowedTypes: ["image/jpeg"],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("許可されていないファイル形式");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("サイズ超過 → success:false で send されない", async () => {
    const file = makeImageFile(
      "big.jpg",
      "image/jpeg",
      JPEG_HEADER,
      20 * 1024 * 1024,
    );
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("MB以下");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("S3Client.send が throw → success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const file = makeImageFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("アップロードに失敗");
  });

  test("path traversal を含む folder → throw（generateStorageKey の guard）", async () => {
    const file = makeImageFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);
    // generateStorageKey が throw → uploadFile の catch で success:false
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA, {
      folder: "../etc",
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("アップロードに失敗");
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("uploadFiles", () => {
  test("2 件順次アップロード", async () => {
    const files = [
      makeImageFile("a.jpg", "image/jpeg", JPEG_HEADER, 1024),
      makeImageFile("b.png", "image/png", PNG_HEADER, 1024),
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
      makeImageFile("a.jpg", "image/jpeg", JPEG_HEADER, 1024),
      makeImageFile("big.jpg", "image/jpeg", JPEG_HEADER, 20 * 1024 * 1024),
      makeImageFile("c.png", "image/png", PNG_HEADER, 1024),
    ];
    const result = await uploadFiles(files, STORAGE_PREFIXES.POSTS);
    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(2); // 最初の1件成功 + 2件目失敗で短絡
    expect(result.error).toContain("big.jpg");
  });
});

describe("DEFAULT_VALIDATION / IMAGE_VALIDATION", () => {
  test("DEFAULT は 全画像 MIME 許可（maxSize 省略時は per-type 上限が適用）", () => {
    expect(DEFAULT_VALIDATION.allowedTypes).toContain("image/jpeg");
    expect(DEFAULT_VALIDATION.allowedTypes).toContain("image/png");
    expect(DEFAULT_VALIDATION.allowedTypes).toContain("image/webp");
    expect(DEFAULT_VALIDATION.allowedTypes).toContain("image/gif");
  });

  test("IMAGE は 全画像 MIME 許可", () => {
    expect(IMAGE_VALIDATION.allowedTypes).toContain("image/jpeg");
    expect(IMAGE_VALIDATION.allowedTypes).toContain("image/png");
    expect(IMAGE_VALIDATION.allowedTypes).toContain("image/webp");
    expect(IMAGE_VALIDATION.allowedTypes).toContain("image/gif");
  });
});
