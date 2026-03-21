/**
 * @description `tryConvertHtmlStringToLexicalJsonString` の smoke テスト
 */

import { beforeEach, describe, expect, test } from "bun:test";

import { tryConvertHtmlStringToLexicalJsonString } from "@/admin/components/editor/lexical/html-to-lexical-json";
import {
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  isLexicalComposerReadyEditorStateJson,
} from "@/shared/lib/validations/lexical";
import { installJSDOMForTests } from "../../../../setup-dom";

beforeEach(() => {
  installJSDOMForTests();
});

describe("tryConvertHtmlStringToLexicalJsonString", () => {
  test("空入力は意図した空ドキュメント（EMPTY）で成功", () => {
    expect(tryConvertHtmlStringToLexicalJsonString("")).toEqual({
      ok: true,
      json: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    });
    expect(tryConvertHtmlStringToLexicalJsonString("   \n")).toEqual({
      ok: true,
      json: EMPTY_LEXICAL_EDITOR_STATE_JSON,
    });
  });

  test("単純な HTML は lexicalJsonSchema 準拠の JSON で成功", () => {
    const result = tryConvertHtmlStringToLexicalJsonString("<p>Hello</p>");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isLexicalComposerReadyEditorStateJson(result.json)).toBe(true);
    }
  });
});
