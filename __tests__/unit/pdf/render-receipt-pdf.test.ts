import { describe, test, expect, mock } from "bun:test";

// Foundation gap analysis (2026-07-15) task #3 (PoC @react-pdf/renderer × Bun 1.3.14) を
// tak #7 receipt-full-wiring PR#3 に統合した動作確認 test。
//
// - Bun 1.3.14 で `@react-pdf/renderer@4.5.1` の `renderToBuffer` が正常動作すること
// - Font.register で Noto Sans JP OTF (jsdelivr 経由) が fetch/embed されること
// - PDF ヘッダー magic ("%PDF-") が正しく出力されること
// - 日本語グリフを含むテキストが例外なくレンダリングされること
//
// 生成 PDF の visual 確認 (macOS プレビュー / Chrome PDF viewer) は Windows 環境では
// 自動化不可のため manual QA に委ねる。本 test は PoC の 3 点検証のうち (a) PDF magic
// と (b) 例外なしレンダリングを機械検証する。
mock.module("server-only", () => ({}));

import { renderReceiptPdf } from "@/shared/pdf/render-receipt-pdf";

describe("renderReceiptPdf", () => {
  test("領収書 PDF Buffer を生成し、PDF magic ヘッダーが正しく出力される", async () => {
    const buffer = await renderReceiptPdf({
      serialNo: "2026-000001",
      issuedAt: new Date("2026-07-15T12:00:00Z"),
      recipientName: "山田 太郎",
      subject: "スペース利用料",
      amount: 11000,
      taxAmount: 1000,
      taxRate: 10,
      issuerSnapshot: {
        businessName: "株式会社サンプル",
        representativeName: "代表 太郎",
        invoiceNumber: "T1234567890123",
        email: "info@example.com",
        phoneNumber: "03-1234-5678",
        address: {
          postalCode: "150-0001",
          prefecture: "東京都",
          city: "渋谷区",
          streetAddress: "神宮前1-1-1",
        },
        snapshotAt: "2026-07-15T12:00:00.000Z",
      },
    });

    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }, 30_000); // Noto Sans JP OTF (~16MB) の初回 CDN fetch を含むため長めに設定

  test("issuerSnapshot に一部フィールド欠損があっても PDF を生成できる (フォールバック確認)", async () => {
    const buffer = await renderReceiptPdf({
      serialNo: "2026-000002",
      issuedAt: new Date("2026-07-15T12:00:00Z"),
      recipientName: "田中 花子",
      subject: "イベント参加費",
      amount: 5500,
      taxAmount: 500,
      taxRate: 10,
      issuerSnapshot: {
        // invoiceNumber / representativeName / phoneNumber が null
        businessName: "株式会社サンプル",
        invoiceNumber: null,
        representativeName: null,
        address: null,
        snapshotAt: "2026-07-15T12:00:00.000Z",
      },
    });

    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString("utf8")).toBe("%PDF-");
  }, 30_000);

  test("issuerSnapshot が null / 不正な型なら DomainError(VALIDATION) を throw", async () => {
    const result = await renderReceiptPdf({
      serialNo: "2026-000003",
      issuedAt: new Date("2026-07-15T12:00:00Z"),
      recipientName: "エラー確認",
      subject: "unit test",
      amount: 1100,
      taxAmount: 100,
      taxRate: 10,
      issuerSnapshot: null,
    }).catch((error: unknown) => error);

    expect(result).toBeInstanceOf(Error);
    const err = result as Error & { code?: string };
    expect(err.code).toBe("VALIDATION");
  });
});
