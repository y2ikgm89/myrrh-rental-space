/**
 * DOM 環境セットアップ（JSDOM）
 *
 * Bun テスト実行時にグローバル DOM を登録する。
 * Lexical の `$generateHtmlFromNodes`（headless）は JSDOM 実装を想定しているため、
 * happy-dom ではなく JSDOM を使う。
 *
 * `DOMParser`（`html-to-lexical-json` の `parseFromString`）もグローバルに載せる。
 *
 * `@lexical/html` は `typeof window` と `global.window` を参照するため、
 * `globalThis` だけでなく Node/Bun の `global` にも代入する。
 *
 * テストファイルが並列実行されグローバルが上書きされた場合に備え、
 * `installJSDOMForTests()` をエクスポートし Lexical 関連テストの `beforeEach` から再適用できる。
 */
import { JSDOM } from "jsdom";

function defineGlobal(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

let jsdomInstance: JSDOM | undefined;

/** Lexical headless HTML 生成などに必要な DOM グローバルを（再）設定する */
export function installJSDOMForTests(): void {
  if (jsdomInstance === undefined) {
    jsdomInstance = new JSDOM(
      "<!DOCTYPE html><html><head></head><body></body></html>",
      {
        url: "http://localhost/",
        pretendToBeVisual: true,
      },
    );
  }

  const { window } = jsdomInstance;

  defineGlobal(globalThis, "window", window);
  defineGlobal(globalThis, "document", window.document);
  defineGlobal(globalThis, "navigator", window.navigator);

  if ("global" in globalThis) {
    const nodeGlobal = globalThis["global"];
    if (typeof nodeGlobal === "object" && nodeGlobal !== null) {
      defineGlobal(nodeGlobal, "window", window);
      defineGlobal(nodeGlobal, "document", window.document);
      defineGlobal(nodeGlobal, "DOMParser", window.DOMParser);
    }
  }

  defineGlobal(globalThis, "Element", window.Element);
  defineGlobal(globalThis, "HTMLElement", window.HTMLElement);
  defineGlobal(globalThis, "SVGElement", window.SVGElement);
  defineGlobal(globalThis, "Node", window.Node);
  defineGlobal(globalThis, "Text", window.Text);
  defineGlobal(globalThis, "DocumentFragment", window.DocumentFragment);
  defineGlobal(globalThis, "Document", window.Document);
  defineGlobal(globalThis, "MutationObserver", window.MutationObserver);
  defineGlobal(globalThis, "customElements", window.customElements);
  defineGlobal(globalThis, "Event", window.Event);
  defineGlobal(
    globalThis,
    "getComputedStyle",
    window.getComputedStyle.bind(window),
  );
  defineGlobal(globalThis, "DOMParser", window.DOMParser);
}

installJSDOMForTests();
