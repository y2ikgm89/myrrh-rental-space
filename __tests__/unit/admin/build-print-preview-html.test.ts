import { describe, expect, test } from "bun:test";
import { buildPrintPreviewHtml } from "@/admin/lib/build-print-preview-html";

describe("buildPrintPreviewHtml", () => {
  test("nonce があるとき <style> に nonce を付ける", () => {
    const html = buildPrintPreviewHtml("<p>本文</p>", "test-nonce-value");

    expect(html).toContain('<style nonce="test-nonce-value">');
    expect(html).toContain("<p>本文</p>");
    expect(html).toContain("@media print{body{margin:0}}");
  });
});
