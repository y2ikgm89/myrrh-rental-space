import { describe, expect, test, mock } from "bun:test";

mock.module("server-only", () => ({}));

const { sanitizeContentHtml, sanitizeRenderedRawEmbedHtml } =
  await import("@/shared/lib/html/sanitize");

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

  test("<object> は常に除去する", () => {
    const result = sanitizeContentHtml('<p>OK</p><object data="x"></object>');
    expect(result).not.toContain("<object");
  });

  test("許可ホスト以外の <iframe> src は除去する", () => {
    const html = '<iframe src="https://evil.example.com/x"></iframe>';
    const result = sanitizeContentHtml(html);
    expect(result).not.toContain("evil.example.com");
  });

  test("許可ホスト（YouTube 等）の <iframe> は属性ごと保持する", () => {
    const html =
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="YouTube video" allow="encrypted-media" allowfullscreen loading="lazy"></iframe>';
    const result = sanitizeContentHtml(html);
    expect(result).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(result).toContain('title="YouTube video"');
    expect(result).toContain("allowfullscreen");
    expect(result).toContain('loading="lazy"');
  });

  test("Google Maps 埋め込みの referrerpolicy 属性を保持する", () => {
    const html =
      '<iframe src="https://www.google.com/maps/embed?pb=1" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
    const result = sanitizeContentHtml(html);
    expect(result).toContain('referrerpolicy="no-referrer-when-downgrade"');
  });

  test("audio / details・summary / ruby・rt / figure・figcaption / button / abbr / colgroup・col を保持する", () => {
    const html =
      '<audio src="https://cdn.example.com/a.mp3" controls preload="none"></audio>' +
      "<details open><summary>質問</summary><div>回答</div></details>" +
      "<ruby>漢字<rt>かんじ</rt></ruby>" +
      '<figure data-image><img src="https://cdn.example.com/x.png" alt="x" /><figcaption data-image-caption>説明</figcaption></figure>' +
      '<button role="tab" data-tab-index="0">タブ</button>' +
      '<abbr data-tooltip="説明" tabindex="0">用語</abbr>' +
      '<table><colgroup><col style="width:100px;" /></colgroup><tbody><tr><td>1</td></tr></tbody></table>';
    const result = sanitizeContentHtml(html);
    expect(result).toContain("<audio");
    expect(result).toContain("controls");
    expect(result).toContain('preload="none"');
    expect(result).toContain("<details");
    expect(result).toContain("open");
    expect(result).toContain("<summary>");
    expect(result).toContain("<ruby>");
    expect(result).toContain("<rt>");
    expect(result).toContain("<figure");
    expect(result).toContain("<figcaption");
    expect(result).toContain('<button role="tab"');
    expect(result).toContain("<abbr");
    expect(result).toContain('tabindex="0"');
    expect(result).toContain("<colgroup>");
    expect(result).toContain("<col");
    expect(result).toMatch(/style="width:100px;?"/);
  });

  test("div / span / img / table 系 style 属性は保持するが、<p> の style は除去する（既存規約）", () => {
    const html =
      '<div style="background-image:url(https://cdn.example.com/bg.png)">帯</div>' +
      '<span style="width:120px;">幅</span>' +
      '<p style="color:red;">本文</p>';
    const result = sanitizeContentHtml(html);
    expect(result).toContain("background-image");
    expect(result).toMatch(/<span style="width:120px;?">/);
    expect(result).not.toMatch(/<p style=/);
  });

  test("style の javascript: / data: / 二重 url() は除去する", () => {
    const payloads = [
      '<div style="background-image:url(javascript:alert(1))">x</div>',
      '<div style="background-image:url(data:image/png;base64,abc)">x</div>',
      '<div style="background-image:url(https://safe.example/x),url(javascript:alert(1))">x</div>',
    ];
    for (const sanitize of [
      sanitizeContentHtml,
      sanitizeRenderedRawEmbedHtml,
    ]) {
      for (const html of payloads) {
        const result = sanitize(html);
        expect(result).not.toContain("javascript:");
        expect(result).not.toContain("data:");
        expect(result).not.toContain("alert");
      }
    }
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

  test('Lexical の <button type="button"> は type を保持する', () => {
    const result = sanitizeContentHtml(
      '<button type="button" role="tab">タブ</button>',
    );
    expect(result).toContain("<button");
    expect(result).toMatch(/type="button"/);
    expect(result).not.toMatch(/type="submit"/);
  });

  test('Lexical の <button type="submit"> と type 無しは type="button" に書き換える', () => {
    const submit = sanitizeContentHtml(
      '<button type="submit" role="tab">送信</button>',
    );
    expect(submit).toContain("<button");
    expect(submit).toMatch(/type="button"/);
    expect(submit).not.toMatch(/type="submit"/);

    const missing = sanitizeContentHtml('<button role="tab">タブ</button>');
    expect(missing).toContain("<button");
    expect(missing).toMatch(/type="button"/);
  });

  test("<sub> / <sup> は sanitize 後も残る", () => {
    const result = sanitizeContentHtml("<p>H<sub>2</sub>O / x<sup>2</sup></p>");
    expect(result).toContain("<sub>2</sub>");
    expect(result).toContain("<sup>2</sup>");
  });
});
