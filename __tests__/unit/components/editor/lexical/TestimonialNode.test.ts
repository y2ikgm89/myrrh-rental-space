/**
 * TestimonialNode Tests
 *
 * @description TestimonialContainerNode / TestimonialItemNode のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import { isRecord } from "@/shared/lib/serialize";
import {
  TestimonialContainerNode,
  TestimonialItemNode,
  $createTestimonialContainerNode,
  $createTestimonialItemNode,
  $isTestimonialContainerNode,
  $isTestimonialItemNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TestimonialNode";

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
    nodes: [TestimonialContainerNode, TestimonialItemNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("TestimonialContainerNode", () => {
  test("JSON round-trip preserves container states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const node = $createTestimonialContainerNode({
        layout: "list",
        columns: 3,
        accentColor: "blue",
      });
      $getRoot().append(node);
    });
    const json = editor.getEditorState().toJSON();
    const nodeJson: unknown = json.root.children[0];
    assertSerializedNode(nodeJson);
    expect(nodeJson["type"]).toBe("testimonial-container");
    expect(nodeJson["layout"]).toBe("list");
    expect(nodeJson["columns"]).toBe(3);
    expect(nodeJson["accentColor"]).toBe("blue");
  });

  test("$isTestimonialContainerNode returns true for TestimonialContainerNode", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const node = $createTestimonialContainerNode();
      result = $isTestimonialContainerNode(node);
    });
    expect(result).toBe(true);
  });

  test("isShadowRoot returns true", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const node = $createTestimonialContainerNode();
      result = node.isShadowRoot();
    });
    expect(result).toBe(true);
  });
});

describe("TestimonialItemNode", () => {
  test("JSON round-trip preserves item states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const container = $createTestimonialContainerNode();
      const item = $createTestimonialItemNode({
        authorName: "山田太郎",
        authorTitle: "CEO",
        avatarUrl: "https://example.com/avatar.jpg",
        rating: 4,
        date: "2024-01-01",
      });
      const para = $createParagraphNode();
      item.append(para);
      container.append(item);
      $getRoot().append(container);
    });
    const json = editor.getEditorState().toJSON();
    const containerJson: unknown = json.root.children[0];
    assertSerializedNode(containerJson);
    const childrenValue = containerJson["children"];
    if (!Array.isArray(childrenValue)) {
      throw new Error("Expected container children to be an array");
    }
    const itemJson: unknown = childrenValue[0];
    assertSerializedNode(itemJson);
    expect(itemJson["type"]).toBe("testimonial-item");
    expect(itemJson["authorName"]).toBe("山田太郎");
    expect(itemJson["authorTitle"]).toBe("CEO");
    expect(itemJson["avatarUrl"]).toBe("https://example.com/avatar.jpg");
    expect(itemJson["rating"]).toBe(4);
    expect(itemJson["date"]).toBe("2024-01-01");
  });

  test("$isTestimonialItemNode returns true for TestimonialItemNode", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const node = $createTestimonialItemNode();
      result = $isTestimonialItemNode(node);
    });
    expect(result).toBe(true);
  });

  test("isShadowRoot returns true", async () => {
    const editor = createEditor();
    let result = false;
    await editor.update(() => {
      const node = $createTestimonialItemNode();
      result = node.isShadowRoot();
    });
    expect(result).toBe(true);
  });
});
