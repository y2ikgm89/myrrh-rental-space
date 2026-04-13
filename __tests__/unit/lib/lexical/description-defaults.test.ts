import { describe, expect, test } from "bun:test";
import {
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";

describe("buildParagraphEditorStateJson", () => {
  test("空文字は EMPTY_LEXICAL_EDITOR_STATE_JSON を返す", () => {
    expect(buildParagraphEditorStateJson("")).toBe(
      EMPTY_LEXICAL_EDITOR_STATE_JSON,
    );
    expect(buildParagraphEditorStateJson("   ")).toBe(
      EMPTY_LEXICAL_EDITOR_STATE_JSON,
    );
  });

  test("段落 1 つを含む JSON を生成する", () => {
    const json = JSON.parse(buildParagraphEditorStateJson("hello"));
    expect(json.root.type).toBe("root");
    const firstChild = json.root.children[0];
    expect(firstChild.type).toBe("paragraph");
    expect(firstChild.children[0].text).toBe("hello");
  });
});

describe("buildParagraphHtml", () => {
  test("HTML エスケープを行う", () => {
    expect(buildParagraphHtml("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>",
    );
  });

  test("空文字は空文字を返す", () => {
    expect(buildParagraphHtml("")).toBe("");
    expect(buildParagraphHtml("   ")).toBe("");
  });

  test("通常テキストを段落でラップ", () => {
    expect(buildParagraphHtml("hello")).toBe("<p>hello</p>");
  });
});
