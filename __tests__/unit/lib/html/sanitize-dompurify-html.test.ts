import { describe, expect, test } from "bun:test";
import { SANITIZE_OPTIONS } from "@/shared/components/SanitizedHtml";
import { sanitizeDomPurifyHtml } from "@/shared/lib/html/sanitize-dompurify-html";

describe("sanitizeDomPurifyHtml iframe hostname allowlist", () => {
  test("allows iframe from LEXICAL allowlist when restrictIframeHostnames is true", () => {
    const dirty =
      '<iframe src="https://www.youtube.com/embed/abc123" title="YouTube"></iframe>';
    const clean = sanitizeDomPurifyHtml(dirty, {
      ...SANITIZE_OPTIONS,
      restrictIframeHostnames: true,
    });
    expect(clean).toContain("www.youtube.com/embed/abc123");
  });

  test("strips iframe from disallowed host when restrictIframeHostnames is true", () => {
    const dirty =
      '<p>before</p><iframe src="https://evil.example/phish"></iframe><p>after</p>';
    const clean = sanitizeDomPurifyHtml(dirty, {
      ...SANITIZE_OPTIONS,
      restrictIframeHostnames: true,
    });
    expect(clean).not.toContain("iframe");
    expect(clean).not.toContain("evil.example");
    expect(clean).toContain("before");
    expect(clean).toContain("after");
  });

  test("preserves disallowed iframe when restrictIframeHostnames is false", () => {
    const dirty = '<iframe src="https://evil.example/phish"></iframe>';
    const clean = sanitizeDomPurifyHtml(dirty, {
      ...SANITIZE_OPTIONS,
      restrictIframeHostnames: false,
    });
    expect(clean).toContain("evil.example");
  });
});
