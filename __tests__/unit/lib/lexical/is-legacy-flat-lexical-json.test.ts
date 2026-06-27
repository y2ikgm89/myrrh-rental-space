import { describe, expect, test } from "bun:test";

import { isLegacyFlatLexicalJson } from "@/shared/lib/lexical/is-legacy-flat-lexical-json";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

describe("isLegacyFlatLexicalJson", () => {
  test("単一段落に全文ベタ結合された JSON を legacy と判定する", () => {
    const legacy = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "第1条 第2条 第3条" }],
          },
        ],
      },
    });
    expect(isLegacyFlatLexicalJson(legacy)).toBe(true);
  });

  test("見出しノードを含む JSON は legacy ではない", () => {
    const structured = JSON.stringify({
      root: {
        type: "root",
        children: [
          {
            type: "heading",
            tag: "h2",
            children: [{ type: "text", text: "第1条" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "本文" }],
          },
        ],
      },
    });
    expect(isLegacyFlatLexicalJson(structured)).toBe(false);
  });

  test("パース不能 JSON は legacy 扱い", () => {
    expect(isLegacyFlatLexicalJson("{invalid")).toBe(true);
  });

  test("空ドキュメント JSON は legacy ではない", () => {
    expect(isLegacyFlatLexicalJson(EMPTY_LEXICAL_EDITOR_STATE_JSON)).toBe(
      false,
    );
  });
});
