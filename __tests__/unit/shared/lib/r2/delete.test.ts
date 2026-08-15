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

import {
  deleteFile,
  deleteFiles,
  deleteObjectsFromBucket,
} from "@/shared/lib/r2/delete";

beforeEach(() => {
  sendMock.mockClear();
});

function keysOf(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `k${i}.jpg`);
}

function objectsInCall(callIndex: number): { Key: string }[] {
  const calls = sendMock.mock.calls as unknown as Array<
    [{ input: { Delete: { Objects: { Key: string }[] } } }]
  >;
  return calls[callIndex][0].input.Delete.Objects;
}

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

  test("1000 keys は 1 回で送る", async () => {
    const result = await deleteFiles(keysOf(1000));
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(objectsInCall(0)).toHaveLength(1000);
  });

  test("1001 keys は 1000 + 1 の 2 回に分割して送る", async () => {
    const result = await deleteFiles(keysOf(1001));
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(objectsInCall(0)).toHaveLength(1000);
    expect(objectsInCall(1)).toHaveLength(1);
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

describe("deleteObjectsFromBucket", () => {
  test("空配列は send せず success:true", async () => {
    const result = await deleteObjectsFromBucket("private-bucket", []);
    expect(result.success).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("1000 keys は 1 回で送る", async () => {
    const result = await deleteObjectsFromBucket(
      "private-bucket",
      keysOf(1000),
    );
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(objectsInCall(0)).toHaveLength(1000);
  });

  test("1001 keys は 1000 + 1 の 2 回に分割して送る", async () => {
    const result = await deleteObjectsFromBucket(
      "private-bucket",
      keysOf(1001),
    );
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(objectsInCall(0)).toHaveLength(1000);
    expect(objectsInCall(1)).toHaveLength(1);
  });
});
