/**
 * persist は React の contentJson snapshot ではなく、
 * Lexical 公式の `editor.getEditorState()` を読む。
 *
 * 旧実装は OnChangePlugin → setState の非同期更新を待たず
 * `handlePreview` が stale な React state を保存していた
 * （E2E: 新タイトル + 旧本文「旧サービス案内（アーカイブ）」）。
 */
import { describe, expect, test } from "bun:test";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";

import { createProjectHeadlessEditor } from "@/admin/components/editor/lexical/create-headless-lexical-editor";
import {
  applyPersistableEditorJson,
  resolvePersistableEditorJson,
} from "@/admin/components/editor/lexical/read-latest-editor-json";
import { EMPTY_LEXICAL_EDITOR_STATE_JSON } from "@/shared/lib/validations/lexical";

const TYPED_BODY = "E2E 投稿本文プレビュー live";
const STALE_BODY = "旧サービス案内（アーカイブ）";

function editorJsonWithText(text: string): string {
  const editor = createProjectHeadlessEditor();
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode().append($createTextNode(text)));
    },
    { discrete: true },
  );
  return JSON.stringify(editor.getEditorState().toJSON());
}

describe("resolvePersistableEditorJson", () => {
  test("live editor state を返し、stale な React snapshot は使わない", () => {
    const editor = createProjectHeadlessEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode().append($createTextNode(TYPED_BODY)));
      },
      { discrete: true },
    );
    const staleReactJson = editorJsonWithText(STALE_BODY);

    const persisted = resolvePersistableEditorJson({
      editor,
      reactJson: staleReactJson,
    });

    expect(persisted).toContain(TYPED_BODY);
    expect(persisted).not.toContain(STALE_BODY);
    expect(persisted).not.toBe(staleReactJson);
  });

  test("editor が無いときは React snapshot にフォールバックする", () => {
    const reactJson = EMPTY_LEXICAL_EDITOR_STATE_JSON;
    expect(resolvePersistableEditorJson({ editor: null, reactJson })).toBe(
      reactJson,
    );
  });
});

describe("applyPersistableEditorJson", () => {
  test("formData の対象フィールドを live editor state で上書きする", () => {
    const editor = createProjectHeadlessEditor();
    editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        root.append($createParagraphNode().append($createTextNode(TYPED_BODY)));
      },
      { discrete: true },
    );
    const formData = new FormData();
    formData.set("descriptionJson", editorJsonWithText(STALE_BODY));

    applyPersistableEditorJson(formData, "descriptionJson", {
      editor,
      reactJson: editorJsonWithText(STALE_BODY),
    });

    const persisted = String(formData.get("descriptionJson"));
    expect(persisted).toContain(TYPED_BODY);
    expect(persisted).not.toContain(STALE_BODY);
  });

  test("editor が無いときは React snapshot で上書きする", () => {
    const reactJson = EMPTY_LEXICAL_EDITOR_STATE_JSON;
    const formData = new FormData();
    formData.set("descriptionJson", editorJsonWithText(STALE_BODY));

    applyPersistableEditorJson(formData, "descriptionJson", {
      editor: null,
      reactJson,
    });

    expect(formData.get("descriptionJson")).toBe(reactJson);
  });
});
