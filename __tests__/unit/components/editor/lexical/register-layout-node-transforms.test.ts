/**
 * registerLayoutNodeTransforms のユニットテスト
 *
 * @description LayoutContainer / LayoutItem の構造正規化（列数同期・空列補完・列減時マージ）
 */

import { describe, test, expect } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getState,
  $setState,
} from "lexical";
import { registerLayoutNodeTransforms } from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/register-layout-node-transforms";
import { $createPopulatedLayoutContainer } from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/lib/layout-insert";
import {
  LayoutContainerNode,
  templateColumnsState,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/LayoutContainerNode";
import {
  LayoutItemNode,
  $isLayoutItemNode,
} from "../../../../../src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/LayoutItemNode";

function createEditor() {
  return createHeadlessEditor({
    namespace: "test-layout-transforms",
    nodes: [LayoutContainerNode, LayoutItemNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("registerLayoutNodeTransforms", () => {
  test("空の LayoutItem に段落が補われる", async () => {
    const editor = createEditor();
    const unregister = registerLayoutNodeTransforms(editor);
    await editor.update(() => {
      const container = $createPopulatedLayoutContainer("1fr 1fr", "1fr");
      const first = container.getFirstChild();
      if (!$isLayoutItemNode(first)) {
        throw new Error("expected layout item");
      }
      first.clear();
      $getRoot().append(container);
    });
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      const container = root.getFirstChild();
      if (!(container instanceof LayoutContainerNode)) {
        throw new Error("expected LayoutContainerNode");
      }
      const item = container.getFirstChild();
      if (!$isLayoutItemNode(item)) {
        throw new Error("expected LayoutItemNode");
      }
      expect(item.getChildrenSize()).toBe(1);
    });
    unregister();
  });

  test("列数を減らすと右端列のブロックが最後の列にマージされる", async () => {
    const editor = createEditor();
    const unregister = registerLayoutNodeTransforms(editor);
    await editor.update(() => {
      const container = $createPopulatedLayoutContainer("1fr 1fr 1fr", "1fr");
      const children = container.getChildren();
      const last = children[children.length - 1];
      if (!$isLayoutItemNode(last)) {
        throw new Error("expected layout item");
      }
      const extra = $createParagraphNode();
      extra.append($createTextNode("merged-marker"));
      last.append(extra);
      $getRoot().append(container);
      $setState(container, templateColumnsState, "1fr 1fr");
    });
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      const container = root.getFirstChild();
      if (!(container instanceof LayoutContainerNode)) {
        throw new Error("expected LayoutContainerNode");
      }
      expect(container.getChildrenSize()).toBe(2);
      const second = container.getChildAtIndex(1);
      if (!$isLayoutItemNode(second)) {
        throw new Error("expected second layout item");
      }
      // 2 列目の空段落 + 3 列目からマージされた 2 段落
      expect(second.getChildrenSize()).toBe(3);
      expect(second.getTextContent().includes("merged-marker")).toBe(true);
    });
    unregister();
  });

  test("コンテナ直下の非 LayoutItem は先頭の LayoutItem へ移動される", async () => {
    const editor = createEditor();
    const unregister = registerLayoutNodeTransforms(editor);
    await editor.update(() => {
      const container = $createPopulatedLayoutContainer("1fr 1fr", "1fr");
      const orphan = $createParagraphNode();
      orphan.append($createTextNode("orphan-text"));
      container.append(orphan);
      $getRoot().append(container);
    });
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      const container = root.getFirstChild();
      if (!(container instanceof LayoutContainerNode)) {
        throw new Error("expected LayoutContainerNode");
      }
      expect(container.getChildrenSize()).toBe(2);
      const first = container.getFirstChild();
      if (!$isLayoutItemNode(first)) {
        throw new Error("expected layout item");
      }
      const found = first
        .getChildren()
        .some((p) => p.getTextContent().includes("orphan-text"));
      expect(found).toBe(true);
    });
    unregister();
  });

  test("templateColumnsState と子 LayoutItem 数が一致する", async () => {
    const editor = createEditor();
    const unregister = registerLayoutNodeTransforms(editor);
    await editor.update(() => {
      const container = $createPopulatedLayoutContainer("1fr 1fr", "1fr");
      $getRoot().append(container);
    });
    await editor.getEditorState().read(() => {
      const root = $getRoot();
      const container = root.getFirstChild();
      if (!(container instanceof LayoutContainerNode)) {
        throw new Error("expected LayoutContainerNode");
      }
      const wide = $getState(container, templateColumnsState);
      const tokenCount = wide.trim().split(/\s+/).filter(Boolean).length;
      expect(container.getChildrenSize()).toBe(Math.max(1, tokenCount));
      container.getChildren().forEach((ch) => {
        expect($isLayoutItemNode(ch)).toBe(true);
      });
    });
    unregister();
  });
});
