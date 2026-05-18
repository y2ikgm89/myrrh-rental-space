/**
 * CoverNode Tests
 *
 * @description CoverNode のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { HeadingNode } from "@lexical/rich-text";
import {
  $getRoot,
  $createParagraphNode,
  type SerializedElementNode,
  type SerializedLexicalNode,
} from "lexical";
import {
  CoverNode,
  $createCoverNode,
  $isCoverNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CoverNode";

/**
 * CoverNode の serialize 結果。$config() の flat: true により stateConfigs が
 * top-level に展開されるため、SerializedElementNode を拡張して各 state プロパティ
 * を optional で持つ shape を test 内で宣言する (default 値は省略される)。
 */
type SerializedCoverNode = SerializedElementNode<SerializedLexicalNode> & {
  type: "cover";
  backgroundImageUrl?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  minHeight?: string;
  contentAlign?: string;
  contentPosition?: string;
};

function assertSerializedCoverNode(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedCoverNode {
  if (node?.type !== "cover") {
    throw new Error(`Expected SerializedCoverNode, got ${String(node?.type)}`);
  }
}

function createEditor() {
  return createHeadlessEditor({
    namespace: "test",
    nodes: [CoverNode, HeadingNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("CoverNode", () => {
  test("JSON round-trip preserves all states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const node = $createCoverNode({
        backgroundImageUrl: "https://example.com/bg.jpg",
        overlayColor: "blue",
        overlayOpacity: 60,
        minHeight: "lg",
        contentAlign: "left",
        contentPosition: "bottom",
      });
      const para = $createParagraphNode();
      node.append(para);
      $getRoot().append(node);
    });
    const json = editor.getEditorState().toJSON();
    const nodeJson = json.root.children[0];
    assertSerializedCoverNode(nodeJson);
    expect(nodeJson.type).toBe("cover");
    expect(nodeJson.backgroundImageUrl).toBe("https://example.com/bg.jpg");
    expect(nodeJson.overlayColor).toBe("blue");
    expect(nodeJson.overlayOpacity).toBe(60);
    expect(nodeJson.minHeight).toBe("lg");
    expect(nodeJson.contentAlign).toBe("left");
    expect(nodeJson.contentPosition).toBe("bottom");
  });

  test("backgroundImageUrl is preserved for non-default value", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const node = $createCoverNode({
        backgroundImageUrl: "https://example.com/cover.png",
      });
      const para = $createParagraphNode();
      node.append(para);
      $getRoot().append(node);
    });
    const json = editor.getEditorState().toJSON();
    const nodeJson = json.root.children[0];
    assertSerializedCoverNode(nodeJson);
    expect(nodeJson.backgroundImageUrl).toBe("https://example.com/cover.png");
  });

  test("isShadowRoot returns true", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const node = $createCoverNode();
      result = node.isShadowRoot();
    });
    expect(result).toBe(true);
  });

  test("$isCoverNode type guard works", async () => {
    const editor = createEditor();
    let coverGuard = false;
    let paraGuard = false;
    await editor.update(() => {
      const node = $createCoverNode();
      const para = $createParagraphNode();
      coverGuard = $isCoverNode(node);
      paraGuard = $isCoverNode(para);
    });
    expect(coverGuard).toBe(true);
    expect(paraGuard).toBe(false);
  });
});
