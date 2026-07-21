/**
 * @description `withLexicalHeadlessDom` の回帰防止テスト。
 *
 * テスト環境は `__tests__/setup-dom.ts` が JSDOM をあらかじめグローバル登録しており、
 * `@lexical/headless/dom` の `withDOM()` は「既存 window を使う」分岐を常に通るため、
 * 本番の Next.js サーバー（誰も window を事前登録しない）で実際に踏む
 * happy-dom フォールバック経路をテストが一度も検証していなかった。
 * このフォールバックには (1) 現行 happy-dom バージョンの
 * `element.querySelector("colgroup")` が必ず例外を投げるバグ、(2) `HTMLElement` 等が
 * グローバルに乗らないため custom node の `instanceof` 判定が `ReferenceError` になる
 * バグの二重の問題があり、テーブルを含む本文の保存が本番で必ず失敗していた。
 *
 * このテストは事前登録済みの DOM グローバルを意図的に取り除いてから
 * `renderEditorStateJsonToHtmlCore` を呼び、本番相当の「何も無い」状態から
 * `withLexicalHeadlessDom` 自身が動く DOM 環境を用意できることを確認する。
 */
import { afterEach, describe, expect, test } from "bun:test";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { createHeadlessEditor } from "@lexical/headless";
import { $createTableRowNode, TableCellHeaderStates } from "@lexical/table";
import { HEADLESS_EDITOR_NODES } from "@/admin/components/editor/lexical/config/nodes";
import { editorTheme } from "@/admin/components/editor/lexical/theme";
import { $createCustomTableNode } from "@/admin/components/editor/lexical/nodes/CustomTableNode";
import { $createCustomTableCellNode } from "@/admin/components/editor/lexical/nodes/CustomTableCellNode";
import { renderEditorStateJsonToHtmlCore } from "@/admin/components/editor/lexical/preview/render-editor-state-json-to-html-core";
import { installJSDOMForTests } from "../../../../setup-dom";

const LEXICAL_HEADLESS_DOM_GLOBAL_KEYS = [
  "window",
  "document",
  "navigator",
  "Element",
  "HTMLElement",
  "HTMLImageElement",
  "HTMLIFrameElement",
  "HTMLDivElement",
  "SVGElement",
  "Node",
  "Text",
  "DocumentFragment",
  "Document",
  "MutationObserver",
  "Event",
  "CustomEvent",
  "getComputedStyle",
  "DOMParser",
] as const;

function buildMultiColumnTableJson(): string {
  const editor = createHeadlessEditor({
    namespace: "headless-dom-environment-probe",
    theme: editorTheme,
    nodes: [...HEADLESS_EDITOR_NODES],
    onError: (error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();

      const table = $createCustomTableNode();
      const headerRow = $createTableRowNode();
      for (const text of ["列A", "列B", "列C"]) {
        const cell = $createCustomTableCellNode(TableCellHeaderStates.ROW);
        cell.append($createParagraphNode().append($createTextNode(text)));
        headerRow.append(cell);
      }
      const dataRow = $createTableRowNode();
      for (const text of ["1", "2", "3"]) {
        const cell = $createCustomTableCellNode();
        cell.append($createParagraphNode().append($createTextNode(text)));
        dataRow.append(cell);
      }
      table.append(headerRow, dataRow);
      root.append(table);
    },
    { discrete: true },
  );

  return JSON.stringify(editor.getEditorState().toJSON());
}

describe("withLexicalHeadlessDom（本番相当の DOM 未登録状態からの回帰防止）", () => {
  afterEach(() => {
    installJSDOMForTests();
  });

  test("テスト側の JSDOM グローバルを全て外しても、複数列テーブルを含む本文が HTML 化できる", () => {
    const json = buildMultiColumnTableJson();

    const previous: Record<string, unknown> = {};
    for (const key of LEXICAL_HEADLESS_DOM_GLOBAL_KEYS) {
      previous[key] = (globalThis as Record<string, unknown>)[key];
      delete (globalThis as Record<string, unknown>)[key];
    }

    try {
      const html = renderEditorStateJsonToHtmlCore(json);
      expect(html).toContain("<table");
      expect(html).toContain("<colgroup>");
      expect(html).toContain("列A");
    } finally {
      for (const key of LEXICAL_HEADLESS_DOM_GLOBAL_KEYS) {
        (globalThis as Record<string, unknown>)[key] = previous[key];
      }
    }
  });
});
