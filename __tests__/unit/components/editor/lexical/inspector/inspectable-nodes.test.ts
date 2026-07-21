/**
 * Inspectable Nodes Tests
 *
 * @description getInspectableInfoとINSPECTABLE_NODE_TYPESのユニットテスト
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createHeadlessEditor } from "@lexical/headless";
import { $getRoot, $getState, type LexicalEditor } from "lexical";

// テスト対象
import { INSPECTABLE_NODE_TYPES_FROM_REGISTRY } from "@/admin/components/editor/lexical/config/inspector-registry";
import {
  getInspectableInfo,
  INSPECTABLE_NODE_TYPES,
} from "@/admin/components/editor/lexical/inspector/hooks/inspectable-nodes";

// ノードのインポート
import {
  ButtonNode,
  $createButtonNode,
  buttonLabelState,
  buttonHrefState,
} from "@/admin/components/editor/lexical/nodes/ButtonNode";
import { createSpan, spansToPlainText } from "@/shared/lib/portable-text";
import {
  ImageNode,
  $createImageNode,
} from "@/admin/components/editor/lexical/nodes/ImageNode";
import {
  CalloutNode,
  $createCalloutNode,
} from "@/admin/components/editor/lexical/nodes/CalloutNode";
import {
  BookmarkNode,
  $createBookmarkNode,
} from "@/admin/components/editor/lexical/nodes/BookmarkNode";
import {
  InternalLinkCardNode,
  $createInternalLinkCardNode,
} from "@/admin/components/editor/lexical/nodes/InternalLinkCardNode";
import {
  InlineIconNode,
  $createInlineIconNode,
} from "@/admin/components/editor/lexical/nodes/InlineIconNode";
import {
  PricingTableContainerNode,
  PricingPlanNode,
  $createPricingTableContainerNode,
  $createPricingPlanNode,
} from "@/admin/components/editor/lexical/nodes/PricingTableNode";
import {
  SpaceCardNode,
  $createSpaceCardNode,
} from "@/admin/components/editor/lexical/nodes/SpaceCardNode";

// =============================================================================
// Test Setup
// =============================================================================

function createTestEditor(): LexicalEditor {
  return createHeadlessEditor({
    namespace: "test",
    nodes: [
      ButtonNode,
      ImageNode,
      CalloutNode,
      BookmarkNode,
      InternalLinkCardNode,
      SpaceCardNode,
      InlineIconNode,
      PricingTableContainerNode,
      PricingPlanNode,
    ],
    onError: (error) => {
      throw error;
    },
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("inspectable-nodes", () => {
  describe("INSPECTABLE_NODE_TYPES", () => {
    test("hooks の配列は inspector-registry の単一正本と同一参照である", () => {
      expect(INSPECTABLE_NODE_TYPES).toBe(INSPECTABLE_NODE_TYPES_FROM_REGISTRY);
      expect(INSPECTABLE_NODE_TYPES.length).toBeGreaterThan(0);
    });

    test("readonly配列である", () => {
      expect(Array.isArray(INSPECTABLE_NODE_TYPES)).toBe(true);
    });
  });

  describe("getInspectableInfo", () => {
    let editor: LexicalEditor;

    beforeEach(() => {
      editor = createTestEditor();
    });

    test("ButtonNodeに対してbutton型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const buttonNode = $createButtonNode({
          label: [createSpan("テストボタン")],
          href: "https://example.com",
        });
        root.append(buttonNode);

        const info = getInspectableInfo(buttonNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("button");
        expect(info?.node).toBe(buttonNode);
        expect(info?.nodeKey).toBe(buttonNode.getKey());
      });
    });

    test("ImageNodeに対してimage型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const imageNode = $createImageNode({
          src: "https://example.com/image.jpg",
          alt: "テスト画像",
        });
        root.append(imageNode);

        const info = getInspectableInfo(imageNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("image");
        expect(info?.node).toBe(imageNode);
        expect(info?.nodeKey).toBe(imageNode.getKey());
      });
    });

    test("CalloutNodeに対してcallout型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const calloutNode = $createCalloutNode("info");
        root.append(calloutNode);

        const info = getInspectableInfo(calloutNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("callout");
        expect(info?.node).toBe(calloutNode);
        expect(info?.nodeKey).toBe(calloutNode.getKey());
      });
    });

    test("BookmarkNodeに対してbookmark型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const bookmarkNode = $createBookmarkNode({
          url: "https://example.com",
          title: "テストブックマーク",
        });
        root.append(bookmarkNode);

        const info = getInspectableInfo(bookmarkNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("bookmark");
        expect(info?.node).toBe(bookmarkNode);
        expect(info?.nodeKey).toBe(bookmarkNode.getKey());
      });
    });

    test("InternalLinkCardNodeに対してinternalLinkCard型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const internalLinkCardNode = $createInternalLinkCardNode({
          contentType: "post",
          contentId: "test-post-id",
        });
        root.append(internalLinkCardNode);

        const info = getInspectableInfo(internalLinkCardNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("internalLinkCard");
        expect(info?.node).toBe(internalLinkCardNode);
        expect(info?.nodeKey).toBe(internalLinkCardNode.getKey());
      });
    });

    test("SpaceCardNodeに対してspaceCard型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const spaceCardNode = $createSpaceCardNode({
          spaceId: "spc-1",
          spaceName: "テストスペース",
        });
        root.append(spaceCardNode);

        const info = getInspectableInfo(spaceCardNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("spaceCard");
        expect(info?.node).toBe(spaceCardNode);
        expect(info?.nodeKey).toBe(spaceCardNode.getKey());
      });
    });

    test("InlineIconNodeに対してinlineIcon型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const inlineIconNode = $createInlineIconNode("star");
        root.append(inlineIconNode);

        const info = getInspectableInfo(inlineIconNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("inlineIcon");
        expect(info?.node).toBe(inlineIconNode);
        expect(info?.nodeKey).toBe(inlineIconNode.getKey());
      });
    });

    test("PricingTableContainerNodeに対してpricingTableContainer型の情報を返す", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const containerNode = $createPricingTableContainerNode();
        containerNode.append($createPricingPlanNode({ name: "テストプラン" }));
        root.append(containerNode);

        const info = getInspectableInfo(containerNode);

        expect(info).not.toBeNull();
        expect(info?.nodeType).toBe("pricingTableContainer");
        expect(info?.node).toBe(containerNode);
        expect(info?.nodeKey).toBe(containerNode.getKey());
      });
    });
  });

  describe("NodeState APIによるプロパティアクセス", () => {
    let editor: LexicalEditor;

    beforeEach(() => {
      editor = createTestEditor();
    });

    test("$getStateでButtonNodeのプロパティを取得できる", async () => {
      await editor.update(() => {
        const root = $getRoot();
        root.clear();
        const buttonNode = $createButtonNode({
          label: [createSpan("テスト")],
          href: "#",
        });
        root.append(buttonNode);

        const info = getInspectableInfo(buttonNode);
        if (!info) {
          throw new Error("info should not be null");
        }

        expect(info.nodeType).toBe("button");
        // NodeState APIでプロパティを読み取る
        expect(spansToPlainText($getState(info.node, buttonLabelState))).toBe(
          "テスト",
        );
        expect($getState(info.node, buttonHrefState)).toBe("#");
      });
    });
  });
});
