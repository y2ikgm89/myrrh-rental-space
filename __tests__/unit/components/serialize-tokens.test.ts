import { describe, expect, test, beforeEach } from "bun:test";
import { JSDOM } from "jsdom";
import {
  serializeNodes,
  applyTokens,
} from "@/admin/components/rich-label-input/serialize-tokens";
import {
  createIconToken,
  createTextToken,
  type ButtonLabelToken,
} from "@/shared/lib/sections/definitions/_shared/button-label";

let dom: JSDOM;
let doc: Document;
beforeEach(() => {
  dom = new JSDOM("<!DOCTYPE html><body></body>");
  doc = dom.window.document;
});

describe("serializeNodes", () => {
  test("空 root は空配列を返す", () => {
    const root = doc.createElement("div");
    expect(serializeNodes(root)).toEqual([]);
  });

  test("text node のみは text token に変換 (_key は自動生成)", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("詳しく見る"));
    const tokens = serializeNodes(root);
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.type).toBe("text");
    if (tokens[0]?.type === "text") {
      expect(tokens[0].value).toBe("詳しく見る");
      expect(tokens[0]._key.length).toBeGreaterThan(0);
    }
  });

  test("data-icon span は icon token に変換し data-key を _key として復元", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("詳しく "));
    const span = doc.createElement("span");
    span.setAttribute("data-icon", "IconArrowRight");
    span.setAttribute("data-key", "icon-key-1");
    span.setAttribute("contenteditable", "false");
    root.appendChild(span);
    root.appendChild(doc.createTextNode(" 見る"));
    const tokens = serializeNodes(root);
    expect(tokens.length).toBe(3);
    expect(tokens[1]).toEqual({
      _key: "icon-key-1",
      type: "icon",
      name: "IconArrowRight",
    });
  });

  test("連続 text node はマージ (先頭 _key を維持)", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("a"));
    root.appendChild(doc.createTextNode("b"));
    const tokens = serializeNodes(root);
    expect(tokens.length).toBe(1);
    if (tokens[0]?.type === "text") {
      expect(tokens[0].value).toBe("ab");
    }
  });

  test("空 text node はスキップ", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode(""));
    root.appendChild(doc.createTextNode("hello"));
    const tokens = serializeNodes(root);
    expect(tokens.length).toBe(1);
    if (tokens[0]?.type === "text") {
      expect(tokens[0].value).toBe("hello");
    }
  });
});

describe("applyTokens", () => {
  test("空配列は root を空にする", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("existing"));
    applyTokens(root, [], doc);
    expect(root.childNodes.length).toBe(0);
  });

  test("text + icon + text を DOM に展開 + data-key を出力", () => {
    const root = doc.createElement("div");
    const iconToken = createIconToken("IconArrowRight");
    const tokens: ButtonLabelToken[] = [
      createTextToken("詳しく "),
      iconToken,
      createTextToken(" 見る"),
    ];
    applyTokens(root, tokens, doc);
    expect(root.childNodes.length).toBe(3);
    expect(root.childNodes[0]?.nodeType).toBe(3); // TEXT_NODE
    const iconEl = root.childNodes[1] as HTMLElement;
    expect(iconEl.getAttribute("data-icon")).toBe("IconArrowRight");
    expect(iconEl.getAttribute("data-key")).toBe(iconToken._key);
    expect(iconEl.getAttribute("contenteditable")).toBe("false");
    expect(iconEl.getAttribute("role")).toBe("img");
    expect(root.childNodes[2]?.nodeType).toBe(3);
  });

  test("round-trip: apply → serialize で icon token の _key が保持される", () => {
    const root = doc.createElement("div");
    const iconToken = createIconToken("IconArrowRight");
    const textToken = createTextToken("Reserve ");
    const tokens: ButtonLabelToken[] = [textToken, iconToken];
    applyTokens(root, tokens, doc);
    const serialized = serializeNodes(root);
    // text token の _key は serialize 時に再生成されるが
    // icon token の _key は data-key 経由で完全保持される
    expect(serialized.length).toBe(2);
    expect(serialized[1]).toEqual(iconToken);
  });
});
