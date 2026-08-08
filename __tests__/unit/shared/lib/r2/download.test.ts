import { describe, test, expect, mock, beforeEach } from "bun:test";

const sendMock = mock(async () => ({}) as Record<string, unknown>);
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  GetObjectCommand: class {
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
  getObjectStream,
  buildAttachmentContentDisposition,
} from "@/shared/lib/r2/download";

beforeEach(() => {
  sendMock.mockClear();
});

describe("getObjectStream", () => {
  test("Body ありなら success:true で web stream / content-type / content-length を返す", async () => {
    const fakeWebStream = new ReadableStream();
    sendMock.mockImplementationOnce(async () => ({
      Body: {
        transformToWebStream: () => fakeWebStream,
      },
      ContentType: "application/pdf",
      ContentLength: 1234,
    }));

    const result = await getObjectStream(
      "inquiries-bucket",
      "inquiries/a/1.pdf",
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.body).toBe(fakeWebStream);
    expect(result.contentType).toBe("application/pdf");
    expect(result.contentLength).toBe(1234);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("Body が無ければ success:false", async () => {
    sendMock.mockImplementationOnce(async () => ({}));

    const result = await getObjectStream("inquiries-bucket", "missing.pdf");

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("見つかりません");
  });

  test("send が throw したら success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("NoSuchKey");
    });

    const result = await getObjectStream("inquiries-bucket", "missing.pdf");

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("取得に失敗");
  });
});

describe("buildAttachmentContentDisposition", () => {
  test("ASCII ファイル名はそのまま percent-encode される", () => {
    const header = buildAttachmentContentDisposition("quote.pdf");
    expect(header).toBe(
      `attachment; filename="quote.pdf"; filename*=UTF-8''quote.pdf`,
    );
  });

  test("日本語ファイル名は RFC 5987 percent-encode される", () => {
    const header = buildAttachmentContentDisposition("見積書.pdf");
    const encoded = encodeURIComponent("見積書.pdf");
    expect(header).toBe(
      `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    );
  });
});
