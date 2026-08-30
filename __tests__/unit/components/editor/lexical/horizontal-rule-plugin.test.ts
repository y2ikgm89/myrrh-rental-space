/**
 * 区切り線の挿入ロジックを固定する。
 *
 * `@lexical/react/LexicalHorizontalRulePlugin` は `@deprecated` だが、案内される
 * 移行先（`@lexical/extension` の `HorizontalRuleExtension`）は extension host 前提で、
 * `LexicalComposer` で組んだこのエディタには当てはまらない。そこで同等の
 * コマンド登録をローカルに置き直した。上流と同じ振る舞いであることをここで固定する。
 *
 * 対象は insert メニューの「区切り線」（`config/insert-items/structure.ts` が
 * `INSERT_HORIZONTAL_RULE_COMMAND` を dispatch する）。
 */
import { describe, expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { HorizontalRuleNode, $isHorizontalRuleNode } from "@lexical/extension";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
} from "lexical";

import { $insertHorizontalRuleAtSelection } from "@/admin/components/editor/lexical/plugins/HorizontalRulePlugin";

function createEditor() {
  return createHeadlessEditor({
    namespace: "horizontal-rule-test",
    nodes: [HorizontalRuleNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("$insertHorizontalRuleAtSelection", () => {
  test("range 選択があれば root 直下に HorizontalRuleNode を挿入して true を返す", () => {
    const editor = createEditor();
    let returned: boolean | undefined;

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("本文"));
        $getRoot().clear().append(paragraph);
        paragraph.selectEnd();

        returned = $insertHorizontalRuleAtSelection();
      },
      { discrete: true },
    );

    expect(returned).toBe(true);

    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren();
      expect(children.some($isHorizontalRuleNode)).toBe(true);
    });
  });

  test("選択が無ければ挿入せず false を返す（他の handler に委ねる）", () => {
    const editor = createEditor();
    let returned: boolean | undefined;

    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("本文"));
        $getRoot().clear().append(paragraph);
        // range 選択でない状態にする。
        $setSelection(null);

        returned = $insertHorizontalRuleAtSelection();
      },
      { discrete: true },
    );

    expect(returned).toBe(false);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().some($isHorizontalRuleNode)).toBe(false);
    });
  });
});
