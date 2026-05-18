/**
 * CoverNode Tests
 *
 * @description CoverNode のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { HeadingNode } from "@lexical/rich-text";
import { $getRoot, $createParagraphNode } from "lexical";
import { isRecord } from "@/shared/lib/serialize";
import {
  CoverNode,
  $createCoverNode,
  $isCoverNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CoverNode";

/**
 * editor.getEditorState().toJSON() の root.children は SerializedLexicalNode[]
 * 型で個別 Node 固有プロパティへの直接 access ができないため、isRecord で narrow
 * してから [key] access で test する。`as` cast を発生させない canonical pattern。
 */
function assertSerializedNode(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("Expected serialized node to be a record");
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
    const nodeJson: unknown = json.root.children[0];
    assertSerializedNode(nodeJson);
    expect(nodeJson["type"]).toBe("cover");
    expect(nodeJson["backgroundImageUrl"]).toBe("https://example.com/bg.jpg");
    expect(nodeJson["overlayColor"]).toBe("blue");
    expect(nodeJson["overlayOpacity"]).toBe(60);
    expect(nodeJson["minHeight"]).toBe("lg");
    expect(nodeJson["contentAlign"]).toBe("left");
    expect(nodeJson["contentPosition"]).toBe("bottom");
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
    const nodeJson: unknown = json.root.children[0];
    assertSerializedNode(nodeJson);
    expect(nodeJson["backgroundImageUrl"]).toBe(
      "https://example.com/cover.png",
    );
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
