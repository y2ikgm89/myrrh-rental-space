/**
 * Lexical headless（サーバー側 HTML⇔JSON 変換）用 DOM 環境。
 *
 * `@lexical/headless/dom` の `withDOM()` は `globalThis.window` が既にあれば
 * それをそのまま使い、なければ内部で `happy-dom` の即席 Window を作ってフォールバックする。
 * だが Lexical のカスタムノード（`instanceof HTMLElement` 等）は JSDOM 相当の
 * 完全な DOM 実装を前提にしており、happy-dom フォールバックには
 * `HTMLElement` 等の主要コンストラクタがグローバルに乗らず、かつ現行バージョンには
 * `element.querySelector("colgroup")` が必ず例外を投げるテーブル関連の実装バグもある
 * （`@lexical/table` の `exportDOM` が内部で呼ぶため、テーブルを含む本文の変換が
 * 例外なく失敗する）。
 *
 * テスト環境だけが `__tests__/setup-dom.ts` で事前に JSDOM をグローバル登録しているため
 * `withDOM()` は常に「既存 window を使う」分岐を通り、上記の happy-dom 経路を一度も
 * 通らない。本番の Next.js サーバーには同等の事前登録が無いため、この関数で
 * 呼び出し前に同じ JSDOM 環境を一時的に用意する。
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

/**
 * `__tests__/setup-dom.ts` と共有する DOM グローバル一覧。
 * Lexical のカスタムノード（YouTube/Vimeo/X/Instagram/Image/Table/Audio/File 等）の
 * `exportDOM` / `importDOM` / `createDOM` が `instanceof` 判定や `document.createElement`
 * で参照するコンストラクタを網羅する。
 */
export function collectLexicalHeadlessDomGlobals(
  window: JSDOM["window"],
): Record<string, unknown> {
  return {
    window,
    document: window["document"],
    navigator: window["navigator"],
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLImageElement: window.HTMLImageElement,
    HTMLIFrameElement: window.HTMLIFrameElement,
    HTMLDivElement: window.HTMLDivElement,
    SVGElement: window.SVGElement,
    Node: window.Node,
    Text: window.Text,
    DocumentFragment: window.DocumentFragment,
    Document: window.Document,
    MutationObserver: window.MutationObserver,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    getComputedStyle: window["getComputedStyle"].bind(window),
    DOMParser: window.DOMParser,
  };
}

function createHeadlessJsdom(): JSDOM {
  return new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
}

/**
 * `callback` の実行中だけ JSDOM ベースの DOM グローバルを設定し、終了後に元へ戻す。
 * 長時間稼働する Next.js サーバープロセスに `globalThis.window` を恒久的に
 * 残さないため、テスト用の `installJSDOMForTests()`（恒久設定・restore なし）とは
 * 異なり save/restore する。
 */
export function withLexicalHeadlessDom<T>(callback: () => T): T {
  const globals = collectLexicalHeadlessDomGlobals(
    createHeadlessJsdom().window,
  );
  const previous = Object.fromEntries(
    Object.keys(globals).map((key) => [key, Reflect.get(globalThis, key)]),
  );

  for (const [key, value] of Object.entries(globals)) {
    defineGlobal(globalThis, key, value);
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      defineGlobal(globalThis, key, value);
    }
    (globals["window"] as JSDOM["window"] | undefined)?.["close"]();
  }
}
