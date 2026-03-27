/**
 * Lexical バリデーションテスト
 *
 * src/shared/lib/validations/lexical.ts のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import {
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  lexicalJsonSchema,
  isLexicalComposerReadyEditorStateJson,
} from "@/shared/lib/validations/lexical";

const LEGACY_EMPTY_ROOT_ONLY =
  '{"root":{"children":[],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

const VALID_FULL_JSON = JSON.stringify({
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "テキスト",
            type: "text",
            version: 1,
          },
        ],
        direction: "ltr",
        format: "",
        indent: 0,
        type: "paragraph",
        version: 1,
      },
    ],
    direction: "ltr",
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
});

describe("isLexicalComposerReadyEditorStateJson", () => {
  test("EMPTY 定数は Composer 初期化可能", () => {
    expect(
      isLexicalComposerReadyEditorStateJson(EMPTY_LEXICAL_EDITOR_STATE_JSON),
    ).toBe(true);
  });

  test("空文字は不可", () => {
    expect(isLexicalComposerReadyEditorStateJson("")).toBe(false);
  });

  test("root の子が空配列のレガシー JSON は不可", () => {
    expect(isLexicalComposerReadyEditorStateJson(LEGACY_EMPTY_ROOT_ONLY)).toBe(
      false,
    );
  });
});

describe("lexicalJsonSchema バリデーション", () => {
  describe("正常系", () => {
    test("EMPTY 定数で通過", () => {
      const result = lexicalJsonSchema.safeParse(
        EMPTY_LEXICAL_EDITOR_STATE_JSON,
      );
      expect(result.success).toBe(true);
    });

    test("段落＋テキストを含む EditorState で通過", () => {
      const result = lexicalJsonSchema.safeParse(VALID_FULL_JSON);
      expect(result.success).toBe(true);
    });
  });

  describe("異常系 — 無効な JSON 文字列", () => {
    test("空文字列はエラー", () => {
      const result = lexicalJsonSchema.safeParse("");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain(
          "有効なLexical EditorState JSONではありません",
        );
      }
    });

    test("不正な JSON 文字列はエラー", () => {
      const result = lexicalJsonSchema.safeParse("not-json");
      expect(result.success).toBe(false);
    });

    test("中途半端な JSON（閉じ括弧なし）はエラー", () => {
      const result = lexicalJsonSchema.safeParse('{ "root":');
      expect(result.success).toBe(false);
    });

    test("JSON 配列（オブジェクトではない）はエラー", () => {
      const result = lexicalJsonSchema.safeParse("[1, 2, 3]");
      expect(result.success).toBe(false);
    });

    test("JSON 文字列（オブジェクトではない）はエラー", () => {
      const result = lexicalJsonSchema.safeParse('"just a string"');
      expect(result.success).toBe(false);
    });

    test("JSON 数値（オブジェクトではない）はエラー", () => {
      const result = lexicalJsonSchema.safeParse("42");
      expect(result.success).toBe(false);
    });

    test("JSON null はエラー", () => {
      const result = lexicalJsonSchema.safeParse("null");
      expect(result.success).toBe(false);
    });

    test("JSON ブーリアン（true）はエラー", () => {
      const result = lexicalJsonSchema.safeParse("true");
      expect(result.success).toBe(false);
    });
  });

  describe("異常系 — root / children", () => {
    test("root プロパティのないオブジェクトはエラー", () => {
      const json = JSON.stringify({ children: [], type: "root" });
      const result = lexicalJsonSchema.safeParse(json);
      expect(result.success).toBe(false);
    });

    test("空オブジェクト（root なし）はエラー", () => {
      const json = JSON.stringify({});
      const result = lexicalJsonSchema.safeParse(json);
      expect(result.success).toBe(false);
    });

    test("Root キーが大文字（Root）の場合はエラー", () => {
      const json = JSON.stringify({ Root: {} });
      const result = lexicalJsonSchema.safeParse(json);
      expect(result.success).toBe(false);
    });

    test("root の子が空配列はエラー", () => {
      const result = lexicalJsonSchema.safeParse(LEGACY_EMPTY_ROOT_ONLY);
      expect(result.success).toBe(false);
    });

    test("root が null はエラー", () => {
      const json = JSON.stringify({ root: null });
      const result = lexicalJsonSchema.safeParse(json);
      expect(result.success).toBe(false);
    });

    test("root が配列はエラー", () => {
      const json = JSON.stringify({ root: [] });
      const result = lexicalJsonSchema.safeParse(json);
      expect(result.success).toBe(false);
    });

    test("root が空オブジェクト（children なし）はエラー", () => {
      const json = JSON.stringify({ root: {} });
      const result = lexicalJsonSchema.safeParse(json);
      expect(result.success).toBe(false);
    });
  });

  describe("異常系 — 型不正", () => {
    test("数値型を渡すとエラー", () => {
      const result = lexicalJsonSchema.safeParse(123);
      expect(result.success).toBe(false);
    });

    test("null を渡すとエラー", () => {
      const result = lexicalJsonSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    test("undefined を渡すとエラー", () => {
      const result = lexicalJsonSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    test("オブジェクトを直接渡すとエラー（JSON 文字列でないため）", () => {
      const result = lexicalJsonSchema.safeParse({ root: {} });
      expect(result.success).toBe(false);
    });
  });
});
