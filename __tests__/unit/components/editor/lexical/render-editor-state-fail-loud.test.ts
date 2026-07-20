import { describe, expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { HEADLESS_EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { deriveLexicalContentHtmlFromJsonCore } from "@/admin/components/editor/lexical/preview/derive-lexical-content-html-core";
import { DomainError } from "@/shared/domain/domain-error";
import { isRecord } from "@/shared/lib/serialize";

/**
 * 正常な editorStateJson を作った後、ルート直下の最初の child node の `type` を
 * 存在しない値に書き換えた「壊れた」JSON を生成する。
 *
 * node の rename/削除等で古い contentJson が「Type not registered」で render 失敗する
 * ケースを模す（M critical バグの再現条件）。
 */
function buildBrokenEditorStateJson(): string {
  const editor = createHeadlessEditor({
    namespace: "broken-node-probe",
    theme: editorTheme,
    nodes: [...HEADLESS_EDITOR_NODES],
    onError: () => {},
  });

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.append(
        $createParagraphNode().append($createTextNode("壊れる前の本文")),
      );
    },
    { discrete: true },
  );

  const json: unknown = editor.getEditorState().toJSON();
  if (!isRecord(json) || !isRecord(json["root"])) {
    throw new Error("unexpected editor state shape");
  }
  const children = json["root"]["children"];
  if (!Array.isArray(children) || children.length === 0) {
    throw new Error("expected at least one root child node");
  }
  const firstChild: unknown = children[0];
  if (!isRecord(firstChild)) {
    throw new Error("expected first child node to be a record");
  }
  firstChild["type"] = "__nonexistent_node_type__";

  return JSON.stringify(json);
}

function buildValidEditorStateJson(): string {
  const editor = createHeadlessEditor({
    namespace: "valid-probe",
    theme: editorTheme,
    nodes: [...HEADLESS_EDITOR_NODES],
    onError: () => {},
  });

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode().append($createTextNode("正常な本文")));
    },
    { discrete: true },
  );

  return JSON.stringify(editor.getEditorState().toJSON());
}

describe("Lexical render failure は空文字列へ silent フォールバックせず throw する (M critical)", () => {
  test("renderEditorStateJsonToHtmlCore は未登録 node type を含む JSON で例外を投げる", () => {
    const broken = buildBrokenEditorStateJson();
    expect(() => renderEditorStateJsonToHtmlCore(broken)).toThrow();
  });

  test("renderEditorStateJsonToHtmlCore は正常な JSON では引き続き HTML を返す（回帰防止）", () => {
    const valid = buildValidEditorStateJson();
    const html = renderEditorStateJsonToHtmlCore(valid);
    expect(html).toContain("正常な本文");
  });

  test("deriveLexicalContentHtmlFromJsonCore は render 失敗を DomainError(UNEXPECTED) でラップして投げる", () => {
    const broken = buildBrokenEditorStateJson();

    let thrown: unknown;
    try {
      deriveLexicalContentHtmlFromJsonCore(broken);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DomainError);
    const domainError = thrown as DomainError;
    expect(domainError.code).toBe("UNEXPECTED");
    expect(domainError.message).toContain("本文のHTML生成に失敗しました");
  });

  test("deriveLexicalContentHtmlFromJsonCore は絶対に空文字列を返さない（silent blank 化の再発防止）", () => {
    const broken = buildBrokenEditorStateJson();
    expect(() => deriveLexicalContentHtmlFromJsonCore(broken)).toThrow();
  });

  test("deriveLexicalContentHtmlFromJsonCore は正常な JSON では引き続き enrich 済み HTML を返す（回帰防止）", () => {
    const valid = buildValidEditorStateJson();
    const html = deriveLexicalContentHtmlFromJsonCore(valid);
    expect(html).toContain("正常な本文");
  });
});
