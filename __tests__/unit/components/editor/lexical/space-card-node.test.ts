import { describe, expect, test } from "bun:test";
import { $getState, createEditor } from "lexical";
import {
  $createSpaceCardNode,
  $isSpaceCardNode,
  SpaceCardNode,
  spaceCardSpaceIdState,
  spaceCardSpaceNameState,
} from "@/admin/components/editor/lexical/nodes/SpaceCardNode";

function withEditor(fn: () => void): void {
  const editor = createEditor({
    nodes: [SpaceCardNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(fn, { discrete: true });
}

describe("SpaceCardNode", () => {
  test("factory が state を設定する", () => {
    withEditor(() => {
      const node = $createSpaceCardNode({
        spaceId: "spc-1",
        spaceName: "テストスペース",
      });
      expect($isSpaceCardNode(node)).toBe(true);
      expect($getState(node, spaceCardSpaceIdState)).toBe("spc-1");
      expect($getState(node, spaceCardSpaceNameState)).toBe("テストスペース");
    });
  });

  test("exportDOM がプレースホルダー a[data-space-card-embed] を出力する", () => {
    withEditor(() => {
      const node = $createSpaceCardNode({
        spaceId: "spc-9",
        spaceName: "会議室A",
      });
      const { element } = node.exportDOM();
      expect(element).toBeInstanceOf(HTMLElement);
      if (!(element instanceof HTMLElement)) return;
      expect(element.getAttribute("data-space-card-embed")).toBe("true");
      expect(element.getAttribute("data-space-id")).toBe("spc-9");
      expect(element.getAttribute("data-space-name")).toBe("会議室A");
      expect(element.tagName).toBe("A");
    });
  });

  test("importDOM ↔ exportDOM が round-trip する", () => {
    withEditor(() => {
      const node = $createSpaceCardNode({
        spaceId: "spc-42",
        spaceName: "テラスルーム",
      });
      const { element } = node.exportDOM();
      if (!(element instanceof HTMLElement)) throw new Error("not element");

      const conversionMap = SpaceCardNode.importDOM();
      const matcher = conversionMap?.["a"];
      expect(matcher).toBeDefined();
      const conversion = matcher?.(element);
      expect(conversion).not.toBeNull();
      const restored = conversion?.conversion(element);
      const restoredRaw = restored?.node;
      const restoredNode = Array.isArray(restoredRaw)
        ? restoredRaw[0]
        : restoredRaw;
      expect($isSpaceCardNode(restoredNode)).toBe(true);
      if (!$isSpaceCardNode(restoredNode)) return;
      expect($getState(restoredNode, spaceCardSpaceIdState)).toBe("spc-42");
      expect($getState(restoredNode, spaceCardSpaceNameState)).toBe(
        "テラスルーム",
      );
    });
  });

  test("importDOM は data-space-name 欠落時に空文字へ fallback する", () => {
    withEditor(() => {
      const el = document.createElement("a");
      el.setAttribute("data-space-card-embed", "true");
      el.setAttribute("data-space-id", "spc-1");

      const conversionMap = SpaceCardNode.importDOM();
      const conversion = conversionMap?.["a"]?.(el)?.conversion(el);
      const node = conversion?.node;
      const single = Array.isArray(node) ? node[0] : node;
      expect($isSpaceCardNode(single)).toBe(true);
      if (!$isSpaceCardNode(single)) return;
      expect($getState(single, spaceCardSpaceNameState)).toBe("");
    });
  });
});
