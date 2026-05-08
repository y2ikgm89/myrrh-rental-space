import { describe, expect, test, beforeEach } from "bun:test";
import { JSDOM } from "jsdom";
import {
  serializeNodes,
  applyTokens,
} from "@/admin/components/rich-label-input/serialize-tokens";
import type { ButtonLabelToken } from "@/shared/lib/sections/definitions/_shared/button-label";

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

  test("text node のみは text token に変換", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("詳しく見る"));
    expect(serializeNodes(root)).toEqual([
      { type: "text", value: "詳しく見る" },
    ]);
  });

  test("data-icon span は icon token に変換", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("詳しく "));
    const span = doc.createElement("span");
    span.setAttribute("data-icon", "IconArrowRight");
    span.setAttribute("contenteditable", "false");
    root.appendChild(span);
    root.appendChild(doc.createTextNode(" 見る"));
    expect(serializeNodes(root)).toEqual([
      { type: "text", value: "詳しく " },
      { type: "icon", name: "IconArrowRight" },
      { type: "text", value: " 見る" },
    ]);
  });

  test("連続 text node はマージ", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("a"));
    root.appendChild(doc.createTextNode("b"));
    expect(serializeNodes(root)).toEqual([{ type: "text", value: "ab" }]);
  });

  test("空 text node はスキップ", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode(""));
    root.appendChild(doc.createTextNode("hello"));
    expect(serializeNodes(root)).toEqual([{ type: "text", value: "hello" }]);
  });
});

describe("applyTokens", () => {
  test("空配列は root を空にする", () => {
    const root = doc.createElement("div");
    root.appendChild(doc.createTextNode("existing"));
    applyTokens(root, [], doc);
    expect(root.childNodes.length).toBe(0);
  });

  test("text + icon + text を DOM に展開", () => {
    const root = doc.createElement("div");
    const tokens: ButtonLabelToken[] = [
      { type: "text", value: "詳しく " },
      { type: "icon", name: "IconArrowRight" },
      { type: "text", value: " 見る" },
    ];
    applyTokens(root, tokens, doc);
    expect(root.childNodes.length).toBe(3);
    expect(root.childNodes[0]?.nodeType).toBe(3); // TEXT_NODE
    const iconEl = root.childNodes[1] as HTMLElement;
    expect(iconEl.getAttribute("data-icon")).toBe("IconArrowRight");
    expect(iconEl.getAttribute("contenteditable")).toBe("false");
    expect(iconEl.getAttribute("role")).toBe("img");
    expect(root.childNodes[2]?.nodeType).toBe(3);
  });

  test("round-trip: serialize ∘ apply は identity", () => {
    const root = doc.createElement("div");
    const tokens: ButtonLabelToken[] = [
      { type: "text", value: "Reserve " },
      { type: "icon", name: "IconArrowRight" },
    ];
    applyTokens(root, tokens, doc);
    expect(serializeNodes(root)).toEqual(tokens);
  });
});
