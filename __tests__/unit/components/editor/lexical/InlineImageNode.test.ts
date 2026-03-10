/**
 * InlineImageNode Tests
 *
 * @description InlineImageNodeのユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import {
  InlineImageNode,
  $createInlineImageNode,
  $isInlineImageNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/InlineImageNode";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeJson = (json.root.children[0] as any).children[0];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeJson = (json.root.children[0] as any).children[0];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeJson = (json.root.children[0] as any).children[0];
    expect(nodeJson.src).toBe("https://example.com/photo.png");
    expect(nodeJson.altText).toBe("A photo");
  });
});
