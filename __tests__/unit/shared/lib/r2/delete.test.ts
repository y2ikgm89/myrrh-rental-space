import { describe, test, expect, mock, beforeEach } from "bun:test";

const sendMock = mock(async () => ({}));
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  DeleteObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DeleteObjectsCommand: class {
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

// eslint-disable-next-line import-x/first
import { deleteFile, deleteFiles } from "@/shared/lib/r2/delete";

beforeEach(() => {
  sendMock.mockClear();
});

describe("deleteFile", () => {
  test("成功時は success:true", async () => {
    const result = await deleteFile("spaces/a/123.jpg");
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("send が throw したら success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const result = await deleteFile("spaces/a/123.jpg");
    expect(result.success).toBe(false);
    expect(result.error).toContain("削除に失敗");
  });
});

describe("deleteFiles", () => {
  test("空配列は send せず success:true", async () => {
    const result = await deleteFiles([]);
    expect(result.success).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("1 件の bulk delete で全 key を送る", async () => {
    const result = await deleteFiles(["a.jpg", "b.png", "c.webp"]);
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("send が throw したら success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const result = await deleteFiles(["a.jpg"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("削除に失敗");
  });
});
