import { describe, expect, test, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { sanitizeContentHtml } = await import("@/shared/lib/html/sanitize");

describe("sanitizeContentHtml", () => {
  test("<script> タグを除去する", () => {
    const result = sanitizeContentHtml(
      "<p>本文</p><script>alert('xss')</script>",
    );
    expect(result).toBe("<p>本文</p>");
  });

  test("on* イベントハンドラ属性を除去する", () => {
    const result = sanitizeContentHtml('<p onclick="alert(1)">クリック</p>');
    expect(result).toBe("<p>クリック</p>");
  });

  test("javascript: スキームの href を除去する", () => {
    const result = sanitizeContentHtml(
      '<a href="javascript:alert(1)">link</a>',
    );
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("alert");
  });

  test("外部 http(s) リンクには target=_blank と rel=noopener noreferrer を強制する", () => {
    const result = sanitizeContentHtml(
      '<a href="https://example.com">外部</a>',
    );
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test("<iframe> と <object> も除去する", () => {
    const html = '<p>OK</p><iframe src="x"></iframe><object data="x"></object>';
    const result = sanitizeContentHtml(html);
    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("<object");
  });

  test("class / id 属性は保持する (装飾用)", () => {
    const result = sanitizeContentHtml('<p class="lead" id="intro">本文</p>');
    expect(result).toContain('class="lead"');
    expect(result).toContain('id="intro"');
  });

  test("style 属性は除去する (CSS injection 防止)", () => {
    const result = sanitizeContentHtml('<p style="background:url(x)">本文</p>');
    expect(result).not.toContain("style=");
  });

  test("通常の段落 / heading / list / img は保持する", () => {
    const html =
      '<h2>見出し</h2><p>段落</p><ul><li>項目</li></ul><img src="https://cdn.example.com/x.png" alt="img" />';
    const result = sanitizeContentHtml(html);
    expect(result).toContain("<h2>");
    expect(result).toContain("<p>");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>");
    expect(result).toContain("<img");
    expect(result).toContain('alt="img"');
  });

  test("Lexical export の data-* / aria-* glob を保持する", () => {
    const html =
      '<div data-future-lexical-node="x" aria-hidden="true" role="tabpanel">本文</div>';
    const result = sanitizeContentHtml(html);
    expect(result).toContain('data-future-lexical-node="x"');
    expect(result).toContain('aria-hidden="true"');
    expect(result).toContain('role="tabpanel"');
  });
});
