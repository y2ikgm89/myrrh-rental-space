/**
 * FeatureIconListNode Tests
 *
 * @description FeatureIconListContainerNode / FeatureIconItemNode のユニットテスト
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
  FeatureIconListContainerNode,
  FeatureIconItemNode,
  $createFeatureIconListContainerNode,
  $createFeatureIconItemNode,
  $isFeatureIconListContainerNode,
  $isFeatureIconItemNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/FeatureIconListNode";

/**
 * FeatureIconList の serialize 結果。$config() の flat: true により stateConfigs
 * が top-level に展開される。default 値は省略されるため optional 宣言。
 */
type SerializedFeatureIconListContainerNode =
  SerializedElementNode<SerializedFeatureIconItemNode> & {
    type: "feature-icon-list-container";
    columns?: number;
    accentColor?: string;
    iconSize?: string;
  };

type SerializedFeatureIconItemNode =
  SerializedElementNode<SerializedLexicalNode> & {
    type: "feature-icon-item";
    iconName?: string;
  };

function assertSerializedFeatureIconListContainerNode(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedFeatureIconListContainerNode {
  if (node?.type !== "feature-icon-list-container") {
    throw new Error(
      `Expected SerializedFeatureIconListContainerNode, got ${String(node?.type)}`,
    );
  }
}

function assertSerializedFeatureIconItemNode(
  node: SerializedLexicalNode | undefined,
): asserts node is SerializedFeatureIconItemNode {
  if (node?.type !== "feature-icon-item") {
    throw new Error(
      `Expected SerializedFeatureIconItemNode, got ${String(node?.type)}`,
    );
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
    const nodeJson = json.root.children[0];
    assertSerializedFeatureIconListContainerNode(nodeJson);
    expect(nodeJson.type).toBe("feature-icon-list-container");
    expect(nodeJson.columns).toBe(3);
    expect(nodeJson.accentColor).toBe("blue");
    expect(nodeJson.iconSize).toBe("lg");
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
    const containerJson = json.root.children[0];
    assertSerializedFeatureIconListContainerNode(containerJson);
    const itemJson = containerJson.children[0];
    assertSerializedFeatureIconItemNode(itemJson);
    expect(itemJson.type).toBe("feature-icon-item");
    expect(itemJson.iconName).toBe("IconClock");
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
