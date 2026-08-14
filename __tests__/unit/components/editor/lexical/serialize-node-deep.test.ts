/**
 * ノード複製が「枠だけの箱」にならないことの検証。
 *
 * == なぜ要るのか ==
 *
 * `ElementNode.exportJSON()` が返す `children` は**常に空配列**。子を埋めるのは
 * editor state 全体を書き出す経路の責務で、単体ノードを直接 `exportJSON()` しても
 * 中身は付いてこない。
 *
 * これを知らずに `node.exportJSON()` → `$parseSerializedNode()` で複製すると、
 * ⋮⋮ メニューの「複製」が**中身の無い空ブロック**を作る（監査 F-28）。段落なら
 * 空段落、Group / Callout / Collapsible / Layout なら枠だけの箱。`DecoratorNode`
 * は state を `exportJSON` に持つので複製できてしまうため、「画像は複製できるのに
 * 段落だけ空になる」という一貫性のない挙動になっていた。
 *
 * 同じ欠陥が `BlockTemplatePlugin`（テンプレート保存）にもあった。
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。headless の実 Lexical エディタで、複製の往復（serialize →
 * parse）を通して中身が残ることを見る。
 */

import { describe, expect, test } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $parseSerializedNode,
  type LexicalNode,
} from "lexical";

import { $serializeNodeDeep } from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/lib/serialize-node-deep";

function createEditor() {
  return createHeadlessEditor({
    onError: (error) => {
      throw error;
    },
  });
}

/** 複製したノードの可視テキストを取る。 */
function duplicateAndReadText(node: LexicalNode): string {
  const clone = $parseSerializedNode($serializeNodeDeep(node));
  return clone.getTextContent();
}

describe("$serializeNodeDeep", () => {
  test("段落を複製すると本文が残る", () => {
    const editor = createEditor();

    let cloneText = "";
    let originalText = "";
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("本日は晴天なり"));
        $getRoot().append(paragraph);

        originalText = paragraph.getTextContent();
        cloneText = duplicateAndReadText(paragraph);
      },
      { discrete: true },
    );

    expect(originalText).toBe("本日は晴天なり");
    // ここが "" になるのが F-28。
    expect(cloneText).toBe("本日は晴天なり");
  });

  test("入れ子（root 直下の複数段落）でも子孫まで残る", () => {
    const editor = createEditor();

    let childCount = 0;
    let cloneText = "";
    editor.update(
      () => {
        const outer = $createParagraphNode();
        outer.append($createTextNode("前半"), $createTextNode("後半"));
        $getRoot().append(outer);

        const serialized = $serializeNodeDeep(outer);
        childCount =
          "children" in serialized && Array.isArray(serialized.children)
            ? serialized.children.length
            : 0;
        cloneText = duplicateAndReadText(outer);
      },
      { discrete: true },
    );

    expect(childCount).toBe(2);
    expect(cloneText).toBe("前半後半");
  });

  test("素の exportJSON は children が空（この helper が要る理由）", () => {
    // 上流の挙動そのものを固定する。ここが変わったら helper の存在意義も変わる。
    const editor = createEditor();

    let rawChildren = -1;
    editor.update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("本文"));
        $getRoot().append(paragraph);

        const raw = paragraph.exportJSON();
        rawChildren =
          "children" in raw && Array.isArray(raw.children)
            ? raw.children.length
            : -1;
      },
      { discrete: true },
    );

    expect(rawChildren).toBe(0);
  });

  test("DecoratorNode（子を持たない）はそのまま返る", () => {
    const editor = createEditor();

    let isElement = true;
    editor.update(
      () => {
        const text = $createTextNode("素のテキスト");
        const paragraph = $createParagraphNode();
        paragraph.append(text);
        $getRoot().append(paragraph);

        isElement = $isElementNode(text);
        expect($serializeNodeDeep(text)).toEqual(text.exportJSON());
      },
      { discrete: true },
    );

    expect(isElement).toBe(false);
  });
});
