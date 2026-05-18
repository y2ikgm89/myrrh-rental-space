/**
 * InlineImageNode Tests
 *
 * @description InlineImageNodeのユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $getRoot,
  $createParagraphNode,
  type SerializedElementNode,
  type SerializedLexicalNode,
} from "lexical";
import {
  InlineImageNode,
  $createInlineImageNode,
  $isInlineImageNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/InlineImageNode";

/**
 * InlineImageNode の serialize 結果。$config() の flat: true により stateConfigs
 * が top-level に展開される。default 値 (position: "full" / width: 200) は省略
 * されるため optional 宣言。
 */
type SerializedInlineImageNode = SerializedLexicalNode & {
  type: "inline-image";
  src: string;
  altText: string;
  position?: string;
  width?: number;
};

function assertSerializedInlineImageNode(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedInlineImageNode {
  if (node?.type !== "inline-image") {
    throw new Error(
      `Expected SerializedInlineImageNode, got ${String(node?.type)}`,
    );
  }
}

/**
 * lexical の SerializedElementNode は `type: string` (literal ではない) が widen
 * されていて `node.type === "paragraph"` で narrow できないため、test 用に
 * literal-typed variant を定義して discriminated union narrow を成立させる。
 */
type SerializedParagraphLike = Omit<
  SerializedElementNode<SerializedLexicalNode>,
  "type"
> & {
  type: "paragraph";
};

function assertSerializedParagraphLike(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedParagraphLike {
  if (node?.type !== "paragraph") {
    throw new Error(`Expected paragraph parent, got ${String(node?.type)}`);
  }
}

function createEditor() {
  return createHeadlessEditor({
    namespace: "test",
    nodes: [InlineImageNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("InlineImageNode", () => {
  test("JSON round-trip preserves all states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const para = $createParagraphNode();
      const node = $createInlineImageNode({
        src: "https://example.com/img.jpg",
        altText: "test",
        position: "left",
        width: 300,
      });
      para.append(node);
      $getRoot().append(para);
    });
    const json = editor.getEditorState().toJSON();
    const paragraph = json.root.children[0];
    assertSerializedParagraphLike(paragraph);
    const nodeJson = paragraph.children[0];
    assertSerializedInlineImageNode(nodeJson);
    expect(nodeJson.type).toBe("inline-image");
    // flat: true でトップレベルにシリアライズされる
    expect(nodeJson.src).toBe("https://example.com/img.jpg");
    expect(nodeJson.position).toBe("left");
    expect(nodeJson.width).toBe(300);
  });

  test("$isInlineImageNode returns true for InlineImageNode", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const node = $createInlineImageNode({
        src: "x",
        altText: "",
        position: "full",
        width: 200,
      });
      result = $isInlineImageNode(node);
    });
    expect(result).toBe(true);
  });

  test("default position and width are omitted from JSON (NodeState flat serialization omits defaults)", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const para = $createParagraphNode();
      const node = $createInlineImageNode({ src: "x", altText: "" });
      para.append(node);
      $getRoot().append(para);
    });
    const json = editor.getEditorState().toJSON();
    const paragraph = json.root.children[0];
    assertSerializedParagraphLike(paragraph);
    const nodeJson = paragraph.children[0];
    assertSerializedInlineImageNode(nodeJson);
    // flat: true + NodeState API はデフォルト値を JSON から省略する
    // position: 'full' と width: 200 は省略され undefined になる
    expect(nodeJson.position).toBeUndefined();
    expect(nodeJson.width).toBeUndefined();
    expect(nodeJson.src).toBe("x");
  });

  test("$isInlineImageNode returns false for non-InlineImageNode", async () => {
    const editor = createEditor();
    let result = true;
    await editor.update(() => {
      const para = $createParagraphNode();
      result = $isInlineImageNode(para);
    });
    expect(result).toBe(false);
  });

  test("src and altText are serialized correctly", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const para = $createParagraphNode();
      const node = $createInlineImageNode({
        src: "https://example.com/photo.png",
        altText: "A photo",
        position: "right",
        width: 150,
      });
      para.append(node);
      $getRoot().append(para);
    });
    const json = editor.getEditorState().toJSON();
    const paragraph = json.root.children[0];
    assertSerializedParagraphLike(paragraph);
    const nodeJson = paragraph.children[0];
    assertSerializedInlineImageNode(nodeJson);
    expect(nodeJson.src).toBe("https://example.com/photo.png");
    expect(nodeJson.altText).toBe("A photo");
  });
});
