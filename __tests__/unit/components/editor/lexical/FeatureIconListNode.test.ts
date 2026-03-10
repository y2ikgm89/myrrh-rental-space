/**
 * FeatureIconListNode Tests
 *
 * @description FeatureIconListContainerNode / FeatureIconItemNode のユニットテスト
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $createParagraphNode } from "lexical";
import {
  FeatureIconListContainerNode,
  FeatureIconItemNode,
  $createFeatureIconListContainerNode,
  $createFeatureIconItemNode,
  $isFeatureIconListContainerNode,
  $isFeatureIconItemNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/FeatureIconListNode";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeJson = json.root.children[0] as any;
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
      const item = $createFeatureIconItemNode({
        iconName: "Instagram",
        iconLibrary: "simple-icons",
      });
      const para = $createParagraphNode();
      item.append(para);
      container.append(item);
      $getRoot().append(container);
    });
    const json = editor.getEditorState().toJSON();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemJson = (json.root.children[0] as any).children[0];
    expect(itemJson.type).toBe("feature-icon-item");
    expect(itemJson.iconName).toBe("Instagram");
    expect(itemJson.iconLibrary).toBe("simple-icons");
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
