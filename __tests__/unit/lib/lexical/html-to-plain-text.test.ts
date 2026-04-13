import { describe, expect, test } from "bun:test";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";

describe("stripHtmlToText", () => {
  test("タグを剥がす", () => {
    expect(stripHtmlToText("<p>hello <strong>world</strong></p>")).toBe(
      "hello world",
    );
  });

  test("ブロック境界を空白に変換", () => {
    expect(stripHtmlToText("<p>a</p><p>b</p>")).toBe("a b");
  });

  test("連続空白を 1 つに圧縮", () => {
    expect(stripHtmlToText("<p>a   b\n\nc</p>")).toBe("a b c");
  });

  test("HTML エンティティをデコード", () => {
    expect(stripHtmlToText("<p>a &amp; b &lt;c&gt; &quot;d&quot;</p>")).toBe(
      'a & b <c> "d"',
    );
  });

  test("maxLength で末尾を丸める", () => {
    expect(stripHtmlToText("<p>abcdef</p>", 4)).toBe("abc…");
  });

  test("空文字は空文字を返す", () => {
    expect(stripHtmlToText("")).toBe("");
  });

  test("br を空白に", () => {
    expect(stripHtmlToText("foo<br>bar")).toBe("foo bar");
  });
});
