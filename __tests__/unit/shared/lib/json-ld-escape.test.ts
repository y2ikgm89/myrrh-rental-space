/**
 * json-ld-escape SSoT ユニットテスト
 *
 * src/shared/lib/json-ld-escape.ts の `escapeJsonForScriptTag` をテストする。
 * 重点: 5 escape (< / > / & / U+2028 / U+2029) が漏れなく適用されること。
 * U+2028/U+2029 は `<script>` 内で JS 行終端と解釈される文字で、
 * 漏らすと文字列リテラル break-out → XSS の余地を残す。
 */

import { describe, test, expect } from "bun:test";
import { escapeJsonForScriptTag } from "@/shared/lib/json-ld-escape";

describe("escapeJsonForScriptTag", () => {
  test("`<` を `\\u003c` にエスケープする", () => {
    const result = escapeJsonForScriptTag('{"x":"</script>"}');
    expect(result).toContain("\\u003c");
    expect(result).not.toContain("<");
  });

  test("`>` を `\\u003e` にエスケープする", () => {
    const result = escapeJsonForScriptTag('{"x":">"}');
    expect(result).toContain("\\u003e");
    expect(result).not.toContain(">");
  });

  test("`&` を `\\u0026` にエスケープする", () => {
    const result = escapeJsonForScriptTag('{"x":"a&b"}');
    expect(result).toContain("\\u0026");
    expect(result).not.toContain("&");
  });

  test("U+2028 (LINE SEPARATOR) を `\\u2028` にエスケープする", () => {
    // 生の U+2028 を input に入れる
    const input = `{"x":"a b"}`;
    const result = escapeJsonForScriptTag(input);
    expect(result).toContain("\\u2028");
    // 生の U+2028 が残っていないこと
    expect(result).not.toContain(" ");
  });

  test("U+2029 (PARAGRAPH SEPARATOR) を `\\u2029` にエスケープする", () => {
    const input = `{"x":"a b"}`;
    const result = escapeJsonForScriptTag(input);
    expect(result).toContain("\\u2029");
    expect(result).not.toContain(" ");
  });

  test("5 種類すべてが同一 input 内で機械的に置換される", () => {
    const input = `{"a":"<&>","b":"a b c"}`;
    const result = escapeJsonForScriptTag(input);
    expect(result).toContain("\\u003c");
    expect(result).toContain("\\u003e");
    expect(result).toContain("\\u0026");
    expect(result).toContain("\\u2028");
    expect(result).toContain("\\u2029");
    expect(result).not.toMatch(/[<>&\u2028\u2029]/);
  });

  test("エスケープ対象外の文字はそのまま保持する", () => {
    const input = `{"x":"hello world","y":123}`;
    expect(escapeJsonForScriptTag(input)).toBe(input);
  });

  test("空文字列を空文字列のまま返す", () => {
    expect(escapeJsonForScriptTag("")).toBe("");
  });

  test("`</script>` 早期クローズ攻撃 payload を無害化する", () => {
    const malicious = JSON.stringify({
      payload: "</script><script>alert(1)</script>",
    });
    const safe = escapeJsonForScriptTag(malicious);
    // `<` が残っていないので `</script>` パーサにヒットしない
    expect(safe).not.toContain("</script>");
    expect(safe).not.toContain("<script");
  });

  test("U+2028 を含む JSON は出力に literal LSEP を残さない (FaqList 回帰)", () => {
    // FaqListSection の元実装は LSEP/PSEP を escape していなかったため、
    // U+2028 を含む FAQ 回答が JS 改行として解釈され break-out 可能だった。
    const faqAnswer = `本文の途中に  行区切りを含む回答`;
    const json = JSON.stringify({
      "@type": "Answer",
      text: faqAnswer,
    });
    const safe = escapeJsonForScriptTag(json);
    expect(safe).not.toContain(" ");
    expect(safe).toContain("\\u2028");
  });
});
