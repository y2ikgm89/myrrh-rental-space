/**
 * serialize-spans.ts unit tests
 *
 * contenteditable DOM ↔ PortableTextSpan[] 双方向変換の純関数を検証する。
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { installJSDOMForTests } from "../../setup-dom";
import {
  KEY_DATA_ATTR,
  SPAN_TYPE_ATTR,
  ICON_NAME_ATTR,
  ICON_CHIP_CLASS_NAME,
  applySpans,
  serializeNodes,
} from "@/admin/components/portable-text/inline-editor/serialize-spans";
import {
  createSpan,
  createInlineIcon,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

beforeAll(() => {
  installJSDOMForTests();
});

function makeRoot(): HTMLElement {
  return document.createElement("div");
}

describe("serializeNodes", () => {
  test("空 root は空配列を返す", () => {
    const root = makeRoot();
    expect(serializeNodes(root)).toEqual([]);
  });

  test("単一 text node を span に serialize", () => {
    const root = makeRoot();
    root.appendChild(document.createTextNode("Hello"));
    const spans = serializeNodes(root);
    expect(spans.length).toBe(1);
    expect(spans[0]?._type).toBe("span");
    if (spans[0]?._type === "span") {
      expect(spans[0].text).toBe("Hello");
    }
  });

  test("複数 text node は merge される", () => {
    const root = makeRoot();
    root.appendChild(document.createTextNode("Hello "));
    root.appendChild(document.createTextNode("World"));
    const spans = serializeNodes(root);
    expect(spans.length).toBe(1);
    if (spans[0]?._type === "span") {
      expect(spans[0].text).toBe("Hello World");
    }
  });

  test("icon span は iconInline として serialize", () => {
    const root = makeRoot();
    const iconEl = document.createElement("span");
    iconEl.setAttribute(ICON_NAME_ATTR, "IconHeart");
    iconEl.setAttribute(KEY_DATA_ATTR, "11111111-1111-4111-8111-111111111111");
    iconEl.setAttribute(SPAN_TYPE_ATTR, "iconInline");
    iconEl.textContent = "IconHeart";
    root.appendChild(iconEl);
    const spans = serializeNodes(root);
    expect(spans.length).toBe(1);
    expect(spans[0]?._type).toBe("iconInline");
    if (spans[0]?._type === "iconInline") {
      expect(spans[0].name).toBe("IconHeart");
      expect(spans[0]._key).toBe("11111111-1111-4111-8111-111111111111");
    }
  });

  test("text + icon + text の混在を順番通りに serialize", () => {
    const root = makeRoot();
    root.appendChild(document.createTextNode("先頭 "));
    const iconEl = document.createElement("span");
    iconEl.setAttribute(ICON_NAME_ATTR, "IconStar");
    iconEl.setAttribute(KEY_DATA_ATTR, "22222222-2222-4222-8222-222222222222");
    iconEl.setAttribute(SPAN_TYPE_ATTR, "iconInline");
    root.appendChild(iconEl);
    root.appendChild(document.createTextNode(" 末尾"));
    const spans = serializeNodes(root);
    expect(spans.length).toBe(3);
    expect(spans[0]?._type).toBe("span");
    expect(spans[1]?._type).toBe("iconInline");
    expect(spans[2]?._type).toBe("span");
  });

  test("空 text node は無視される", () => {
    const root = makeRoot();
    root.appendChild(document.createTextNode(""));
    root.appendChild(document.createTextNode("X"));
    const spans = serializeNodes(root);
    expect(spans.length).toBe(1);
  });

  test("data-portable-icon 不在の element は無視される", () => {
    const root = makeRoot();
    const div = document.createElement("div");
    div.textContent = "ignored";
    root.appendChild(div);
    expect(serializeNodes(root)).toEqual([]);
  });
});

describe("applySpans", () => {
  test("空配列は root を空にする", () => {
    const root = makeRoot();
    root.appendChild(document.createTextNode("existing"));
    applySpans(root, [], document);
    expect(root.childNodes.length).toBe(0);
  });

  test("text span は textNode として描画される", () => {
    const root = makeRoot();
    applySpans(root, [createSpan("Hello")], document);
    expect(root.childNodes.length).toBe(1);
    expect(root.firstChild?.nodeType).toBe(3);
    expect(root.firstChild?.textContent).toBe("Hello");
  });

  test("iconInline span は span 要素 + 全 data-attribute で描画される", () => {
    const root = makeRoot();
    const span = createInlineIcon("IconHeart");
    applySpans(root, [span], document);
    expect(root.childNodes.length).toBe(1);
    const el = root.firstChild as HTMLElement;
    expect(el.getAttribute(ICON_NAME_ATTR)).toBe("IconHeart");
    expect(el.getAttribute(KEY_DATA_ATTR)).toBe(span._key);
    expect(el.getAttribute(SPAN_TYPE_ATTR)).toBe("iconInline");
    expect(el.getAttribute("contenteditable")).toBe("false");
    expect(el.getAttribute("role")).toBe("img");
    expect(el.className).toBe(ICON_CHIP_CLASS_NAME);
  });

  test("apply → serialize で round-trip 成立（iconInline の _key は保持、text は再生成）", () => {
    const root = makeRoot();
    const original: PortableTextSpan[] = [
      createSpan("Hello "),
      createInlineIcon("IconStar"),
      createSpan(" World"),
    ];
    applySpans(root, original, document);
    const restored = serializeNodes(root);
    expect(restored.length).toBe(3);
    expect(restored[0]?._type).toBe("span");
    if (restored[0]?._type === "span") {
      expect(restored[0].text).toBe("Hello ");
    }
    // iconInline の _key は DOM data-attribute 経由で保持される
    expect(restored[1]?._type).toBe("iconInline");
    expect(restored[1]?._key).toBe(original[1]?._key ?? "");
    expect(restored[2]?._type).toBe("span");
    if (restored[2]?._type === "span") {
      expect(restored[2].text).toBe(" World");
    }
  });
});
