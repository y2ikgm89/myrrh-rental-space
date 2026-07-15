import { describe, test, expect, mock } from "bun:test";

// crypto.ts は encryption key の env を要求するが __tests__/setup.ts で dummy key に
// mock されている (server-only + DATABASE_URL と同じ preload)。追加 mock は不要。
mock.module("server-only", () => ({}));

import {
  createReceiptDownloadToken,
  verifyReceiptDownloadToken,
  MAX_RECEIPT_DOWNLOAD_TOKEN_LIFETIME_MS,
} from "@/shared/lib/receipt-download-token";

describe("createReceiptDownloadToken + verifyReceiptDownloadToken", () => {
  test("round-trip で serialNo が復元される", () => {
    const issuedAt = new Date("2026-07-15T00:00:00Z");
    const token = createReceiptDownloadToken("2026-000001", issuedAt);
    const now = new Date("2026-07-15T00:30:00Z"); // 30 分後 (有効期限 60 分以内)
    const result = verifyReceiptDownloadToken(token, now);
    if (!result.valid) throw new Error("token should be valid");
    expect(result.serialNo).toBe("2026-000001");
  });

  test("有効期限 60 分を過ぎると invalid", () => {
    const issuedAt = new Date("2026-07-15T00:00:00Z");
    const token = createReceiptDownloadToken("2026-000002", issuedAt);
    const nowAfterExpiry = new Date(
      issuedAt.getTime() + MAX_RECEIPT_DOWNLOAD_TOKEN_LIFETIME_MS + 1,
    );
    const result = verifyReceiptDownloadToken(token, nowAfterExpiry);
    expect(result.valid).toBe(false);
  });

  test("改ざんされたトークンは invalid", () => {
    const token = createReceiptDownloadToken(
      "2026-000003",
      new Date("2026-07-15T00:00:00Z"),
    );
    const tampered = token.slice(0, -4) + "XXXX";
    const result = verifyReceiptDownloadToken(tampered, new Date());
    expect(result.valid).toBe(false);
  });

  test("空文字列トークンは invalid", () => {
    const result = verifyReceiptDownloadToken("", new Date());
    expect(result.valid).toBe(false);
  });

  test("purpose 異なるトークン (event-registration-claim-token) は decrypt に失敗して invalid", async () => {
    const { createEventRegistrationClaimToken } =
      await import("@/shared/lib/event-registration-claim-token");
    const wrongPurposeToken = createEventRegistrationClaimToken("reg-1");
    const result = verifyReceiptDownloadToken(wrongPurposeToken, new Date());
    expect(result.valid).toBe(false);
  });
});
