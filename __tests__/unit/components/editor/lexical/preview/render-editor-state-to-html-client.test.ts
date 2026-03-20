/**
 * @description `renderEditorStateJsonToHtmlClient` の smoke テスト
 */

import { describe, test, expect } from "bun:test";

import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";

/** Lexical 0.41 で検証した最小 paragraph + text の EditorState JSON */
const MINIMAL_PARAGRAPH_STATE_JSON = JSON.stringify({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "hello mobile preview",
            type: "text",
            version: 1,
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
        textFormat: 0,
        textStyle: "",
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

describe("renderEditorStateJsonToHtmlClient", () => {
  test("空・空白のみの JSON 文字列は空文字を返す", () => {
    expect(renderEditorStateJsonToHtmlClient("")).toBe("");
    expect(renderEditorStateJsonToHtmlClient("   ")).toBe("");
  });

  test("段落付き EditorState JSON から HTML が生成されテキストを含む", () => {
    const html = renderEditorStateJsonToHtmlClient(MINIMAL_PARAGRAPH_STATE_JSON);

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("hello mobile preview");
  });
});
