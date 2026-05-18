/**
 * FeatureIconListNode Tests
 *
 * @description FeatureIconListContainerNode / FeatureIconItemNode のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import { isRecord } from "@/shared/lib/serialize";
import {
  FeatureIconListContainerNode,
  FeatureIconItemNode,
  $createFeatureIconListContainerNode,
  $createFeatureIconItemNode,
  $isFeatureIconListContainerNode,
  $isFeatureIconItemNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/FeatureIconListNode";

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
    nodes: [FeatureIconListContainerNode, FeatureIconItemNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("FeatureIconListContainerNode", () => {
  test("JSON round-trip preserves container states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const node = $createFeatureIconListContainerNode({
        columns: 3,
        accentColor: "blue",
        iconSize: "lg",
      });
      $getRoot().append(node);
    });
    const json = editor.getEditorState().toJSON();
    const nodeJson: unknown = json.root.children[0];
    assertSerializedNode(nodeJson);
    expect(nodeJson["type"]).toBe("feature-icon-list-container");
    expect(nodeJson["columns"]).toBe(3);
    expect(nodeJson["accentColor"]).toBe("blue");
    expect(nodeJson["iconSize"]).toBe("lg");
  });

  test("isShadowRoot returns true for both nodes", async () => {
    const editor = createEditor();
    let containerResult = false;
    let itemResult = false;
    await editor.update(() => {
      const container = $createFeatureIconListContainerNode();
      const item = $createFeatureIconItemNode();
      containerResult = container.isShadowRoot();
      itemResult = item.isShadowRoot();
    });
    expect(containerResult).toBe(true);
    expect(itemResult).toBe(true);
  });
});

describe("FeatureIconItemNode", () => {
  test("JSON round-trip preserves item states", async () => {
    const editor = createEditor();
    await editor.update(() => {
      const container = $createFeatureIconListContainerNode();
      const item = $createFeatureIconItemNode({ iconName: "IconClock" });
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
    expect(itemJson["type"]).toBe("feature-icon-item");
    expect(itemJson["iconName"]).toBe("IconClock");
  });

  test("$isFeatureIconListContainerNode and $isFeatureIconItemNode type guards work", async () => {
    const editor = createEditor();
    let containerGuard = false;
    let itemGuard = false;
    await editor.update(() => {
      const container = $createFeatureIconListContainerNode();
      const item = $createFeatureIconItemNode();
      containerGuard = $isFeatureIconListContainerNode(container);
      itemGuard = $isFeatureIconItemNode(item);
    });
    expect(containerGuard).toBe(true);
    expect(itemGuard).toBe(true);
  });
});
