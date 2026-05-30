import { describe, expect, test } from "bun:test";
import { $getState, createEditor } from "lexical";
import {
  $createInternalLinkCardNode,
  $isInternalLinkCardNode,
  InternalLinkCardNode,
  internalLinkCardContentIdState,
  internalLinkCardContentTypeState,
} from "@/admin/components/editor/lexical/nodes/InternalLinkCardNode";

function withEditor(fn: () => void): void {
  const editor = createEditor({
    nodes: [InternalLinkCardNode],
    onError: (e) => {
      throw e;
    },
  });
  editor.update(fn, { discrete: true });
}

describe("InternalLinkCardNode", () => {
  test("factory が state を設定する", () => {
    withEditor(() => {
      const node = $createInternalLinkCardNode({
        contentType: "post",
        contentId: "abc-123",
      });
      expect($isInternalLinkCardNode(node)).toBe(true);
      expect($getState(node, internalLinkCardContentTypeState)).toBe("post");
      expect($getState(node, internalLinkCardContentIdState)).toBe("abc-123");
    });
  });

  test("exportDOM がプレースホルダー a[data-internal-link-card] を出力する", () => {
    withEditor(() => {
      const node = $createInternalLinkCardNode({
        contentType: "event",
        contentId: "evt-9",
      });
      const { element } = node.exportDOM();
      expect(element).toBeInstanceOf(HTMLElement);
      if (!(element instanceof HTMLElement)) return;
      expect(element.getAttribute("data-internal-link-card")).toBe("true");
      expect(element.getAttribute("data-content-type")).toBe("event");
      expect(element.getAttribute("data-content-id")).toBe("evt-9");
      expect(element.tagName).toBe("A");
    });
  });

  test("importDOM で不正な data-content-type は post に fallback する", () => {
    withEditor(() => {
      const el = document.createElement("a");
      el.setAttribute("data-internal-link-card", "true");
      el.setAttribute("data-content-type", "garbage");
      el.setAttribute("data-content-id", "x");

      const conversionMap = InternalLinkCardNode.importDOM();
      const conversion = conversionMap?.["a"]?.(el)?.conversion(el);
      const node = conversion?.node;
      const single = Array.isArray(node) ? node[0] : node;
      expect($isInternalLinkCardNode(single)).toBe(true);
      if (!$isInternalLinkCardNode(single)) return;
      expect($getState(single, internalLinkCardContentTypeState)).toBe("post");
    });
  });

  test("importDOM ↔ exportDOM が round-trip する", () => {
    withEditor(() => {
      const node = $createInternalLinkCardNode({
        contentType: "space",
        contentId: "spc-42",
      });
      const { element } = node.exportDOM();
      if (!(element instanceof HTMLElement)) throw new Error("not element");

      const conversionMap = InternalLinkCardNode.importDOM();
      const matcher = conversionMap?.["a"];
      expect(matcher).toBeDefined();
      const conversion = matcher?.(element);
      expect(conversion).not.toBeNull();
      const restored = conversion?.conversion(element);
      const restoredRaw = restored?.node;
      const restoredNode = Array.isArray(restoredRaw)
        ? restoredRaw[0]
        : restoredRaw;
      expect($isInternalLinkCardNode(restoredNode)).toBe(true);
      if (!$isInternalLinkCardNode(restoredNode)) return;
      expect($getState(restoredNode, internalLinkCardContentTypeState)).toBe(
        "space",
      );
      expect($getState(restoredNode, internalLinkCardContentIdState)).toBe(
        "spc-42",
      );
    });
  });
});
