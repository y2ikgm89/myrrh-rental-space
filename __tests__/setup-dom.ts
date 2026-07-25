/**
 * DOM 環境セットアップ（JSDOM）
 *
 * Bun テスト実行時にグローバル DOM を登録する。
 * Lexical の `$generateHtmlFromNodes`（headless）は JSDOM 実装を想定しているため、
 * happy-dom ではなく JSDOM を使う。Lexical に必要な中核グローバル一覧は
 * 本番のサーバー側変換（保存時の JSON→HTML 等）とも共有する
 * `collectLexicalHeadlessDomGlobals`（`src/shared/lib/lexical-headless-dom-environment.ts`）
 * が SSoT。ここではそれに加え、conform フォームテスト等 Lexical 以外のテストが
 * 必要とする追加グローバルを重ねて設定する。
 *
 * `@lexical/html` は `typeof window` と `global.window` を参照するため、
 * `globalThis` だけでなく Node/Bun の `global` にも代入する。
 *
 * テストファイルが並列実行されグローバルが上書きされた場合に備え、
 * `installJSDOMForTests()` をエクスポートし Lexical 関連テストの `beforeEach` から再適用できる。
 */
import { JSDOM } from "jsdom";
import { collectLexicalHeadlessDomGlobals } from "../src/shared/lib/lexical-headless-dom-environment";

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

  for (const [key, value] of Object.entries(
    collectLexicalHeadlessDomGlobals(window),
  )) {
    defineGlobal(globalThis, key, value);
  }

  // conform の getFormAction が bare `location` を参照するため global へ載せる
  // (form.insert/remove の submit 経路で必要)。
  defineGlobal(globalThis, "location", window["location"]);

  if ("global" in globalThis) {
    const nodeGlobal = globalThis["global"];
    if (typeof nodeGlobal === "object" && nodeGlobal !== null) {
      defineGlobal(nodeGlobal, "window", window);
      defineGlobal(nodeGlobal, "document", window["document"]);
      defineGlobal(nodeGlobal, "DOMParser", window.DOMParser);
    }
  }

  // conform の form observation (integrations: getFieldElements) は
  // form.elements を HTMLInputElement / HTMLSelectElement / HTMLTextAreaElement で
  // instanceof フィルタするため、これらの constructor を global へ載せる。
  defineGlobal(globalThis, "HTMLInputElement", window.HTMLInputElement);
  defineGlobal(globalThis, "HTMLSelectElement", window.HTMLSelectElement);
  defineGlobal(globalThis, "HTMLTextAreaElement", window.HTMLTextAreaElement);
  defineGlobal(globalThis, "HTMLButtonElement", window.HTMLButtonElement);
  defineGlobal(globalThis, "HTMLFormElement", window.HTMLFormElement);
  defineGlobal(globalThis, "customElements", window["customElements"]);
  defineGlobal(globalThis, "sessionStorage", window["sessionStorage"]);
  defineGlobal(globalThis, "localStorage", window["localStorage"]);

  // jsdom は HTMLDialogElement.showModal() / close() を未実装。
  // dialog 要素を使うコンポーネントのテストが TypeError で落ちるため polyfill する。
  // open 属性の付け外しで open プロパティを模倣（JSDOM の HTMLDialogElement.open は
  // 属性 reflect なので setAttribute で連動する）。
  if (typeof window.HTMLDialogElement !== "undefined") {
    if (!window.HTMLDialogElement.prototype.showModal) {
      window.HTMLDialogElement.prototype.showModal = function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute("open", "");
      };
    }
    if (!window.HTMLDialogElement.prototype.close) {
      window.HTMLDialogElement.prototype.close = function (
        this: HTMLDialogElement,
      ) {
        this.removeAttribute("open");
      };
    }
  }
}

installJSDOMForTests();
