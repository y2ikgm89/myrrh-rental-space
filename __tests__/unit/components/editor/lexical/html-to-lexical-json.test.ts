/**
 * @description `tryConvertHtmlStringToLexicalJsonString` の smoke テスト
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $createTextNode, $getRoot } from "lexical";

import { tryConvertHtmlStringToLexicalJsonString } from "@/admin/components/editor/lexical/html-to-lexical-json";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { HEADLESS_EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { $createCustomHeadingNode } from "@/admin/components/editor/lexical/nodes/CustomHeadingNode";
import {
  EMPTY_LEXICAL_EDITOR_STATE_JSON,
  isLexicalComposerReadyEditorStateJson,
} from "@/shared/lib/validations/lexical";
import { isRecord } from "@/shared/lib/serialize";
import { installJSDOMForTests } from "../../../../setup-dom";

beforeEach(() => {
  installJSDOMForTests();
});

function buildHeadingEditorStateJson(anchorId: string): string {
  const editor = createHeadlessEditor({
    namespace: "heading-roundtrip-probe",
    theme: editorTheme,
    nodes: [...HEADLESS_EDITOR_NODES],
    onError: () => {},
  });

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.append(
        $createCustomHeadingNode("h2", anchorId).append(
          $createTextNode("見出し"),
        ),
      );
    },
    { discrete: true },
  );

  return JSON.stringify(editor.getEditorState().toJSON());
}

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

describe("exportDOM/importDOM round-trip parity", () => {
  test("CustomHeadingNode の anchorId は HTML round-trip 後も復元される", () => {
    const original = buildHeadingEditorStateJson("my-anchor");
    const html = renderEditorStateJsonToHtmlCore(original);
    expect(html).toContain('id="my-anchor"');

    const result = tryConvertHtmlStringToLexicalJsonString(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const parsed: unknown = JSON.parse(result.json);
    if (!isRecord(parsed) || !isRecord(parsed["root"])) {
      throw new Error("unexpected editor state shape");
    }
    const children = parsed["root"]["children"];
    if (!Array.isArray(children) || children.length === 0) {
      throw new Error("expected at least one root child node");
    }
    const heading: unknown = children[0];
    if (!isRecord(heading)) {
      throw new Error("expected first child node to be a record");
    }
    expect(heading["anchorId"]).toBe("my-anchor");
  });
});
