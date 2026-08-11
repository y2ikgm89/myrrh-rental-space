/**
 * `SanitizedHtml` へ渡す HTML を作る sanitize の回帰テスト。
 *
 * gallery / tabs は `data-*` 属性だけで client hydrate するため、sanitize がそれを
 * 落とすと**画像も tab も無言で動かなくなる**（HTML は出るのでエラーにならない）。
 *
 * sanitize は client の DOMPurify からサーバーの `sanitize-html` へ移した。移行で
 * これらの属性が落ちないことを固定する。
 */
import { describe, expect, test } from "bun:test";
import {
  sanitizeLexicalContentHtml,
  sanitizeRawEmbedHtml,
} from "@/shared/lib/html/sanitize-content-html-core";

describe("sanitizeLexicalContentHtml keeps hydration hooks", () => {
  test("gallery の data-* を保持する", () => {
    const clean = sanitizeLexicalContentHtml(
      '<div data-gallery="items" data-gallery-columns="2" data-gallery-style="masonry" data-gallery-item="0" data-gallery-placeholder="loading">' +
        '<img data-gallery-img="true" data-src="img.jpg" data-alt="An image" data-caption="Caption text"/>' +
        "</div>",
    );

    for (const attribute of [
      "data-gallery",
      "data-gallery-columns",
      "data-gallery-style",
      "data-gallery-item",
      "data-gallery-placeholder",
      "data-gallery-img",
      "data-src",
      "data-alt",
      "data-caption",
    ]) {
      expect(clean).toContain(attribute);
    }
  });

  test("tabs の data-* / role / aria-* を保持する", () => {
    const clean = sanitizeLexicalContentHtml(
      '<div data-tabs-container="true" role="tablist">' +
        '<button role="tab" aria-selected="true" data-tab-index="0">Tab</button>' +
        "</div>",
    );

    expect(clean).toContain("data-tabs-container");
    expect(clean).toContain('role="tablist"');
    expect(clean).toContain('role="tab"');
    expect(clean).toContain('aria-selected="true"');
    expect(clean).toContain('data-tab-index="0"');
  });

  test("script は落とす", () => {
    expect(
      sanitizeLexicalContentHtml("<p>ok</p><script>alert(1)</script>"),
    ).toBe("<p>ok</p>");
  });
});

describe("sanitizeRawEmbedHtml (CustomSection / EmbedSection)", () => {
  test("allowlist 内の iframe は残す", () => {
    const clean = sanitizeRawEmbedHtml(
      '<iframe src="https://www.youtube.com/embed/abc" title="v"></iframe>',
    );
    expect(clean).toContain("https://www.youtube.com/embed/abc");
  });

  test("allowlist 外の iframe は要素ごと落とす（src だけ剥がして空枠を残さない）", () => {
    const clean = sanitizeRawEmbedHtml(
      '<p>keep</p><iframe src="https://evil.example/x"></iframe>',
    );
    expect(clean).toBe("<p>keep</p>");
  });

  test("Lexical profile が許さない構造タグを許す（生 HTML 用に広い）", () => {
    const clean = sanitizeRawEmbedHtml(
      "<section><header>h</header><video controls></video></section>",
    );
    expect(clean).toContain("<section>");
    expect(clean).toContain("<header>");
    expect(clean).toContain("<video");
    // Lexical 側は狭いままであることも同時に固定する
    expect(sanitizeLexicalContentHtml("<section>x</section>")).toBe("x");
  });

  test("フォーム部品と script は落とす", () => {
    const clean = sanitizeRawEmbedHtml(
      '<form><input name="a"/></form><script>alert(1)</script><p>ok</p>',
    );
    expect(clean).toBe("<p>ok</p>");
  });

  test("イベントハンドラ属性は落とす", () => {
    expect(
      sanitizeRawEmbedHtml('<img src="x" onerror="alert(1)"/>'),
    ).not.toContain("onerror");
  });
});
