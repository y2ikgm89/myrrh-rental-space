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
 *
 * `jsdom` はトップレベル `import` にすると、Next.js の Turbopack が本番 build の
 * 「ページデータ収集」段階でこのモジュールを import する全ページに対し jsdom 自体を
 * 静的解析しようとし、jsdom 内部の相対パス `require("../data/patch.json")` 等の
 * 解決に失敗して `Cannot find module` で build が落ちる
 * （`serverExternalPackages: ["jsdom"]` を next.config.ts に足しても解消しない —
 * Turbopack 側の外部化判定が jsdom を対象外と判断する模様）。
 * `createRequire` による遅延 require は `withLexicalHeadlessDom` が実際に呼ばれる
 * 実行時まで jsdom のロードを遅延させ、ページデータ収集時には一切評価されないため
 * この build エラーを回避する。
 */
import { createRequire } from "node:module";

type JSDOMModule = typeof import("jsdom");
type JSDOM = InstanceType<JSDOMModule["JSDOM"]>;

let jsdomModule: JSDOMModule | undefined;

function loadJsdomModule(): JSDOMModule {
  if (jsdomModule === undefined) {
    const require = createRequire(import.meta.url);
    jsdomModule = require("jsdom") as JSDOMModule;
  }
  return jsdomModule;
}

function defineGlobal(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

/**
 * `@types/jsdom` の `DOMWindow` は `[key: string]: any` の index signature を持つ。
 * `noPropertyAccessFromIndexSignature` によりブラケット記法が必須な `document` /
 * `navigator` / `getComputedStyle` / `close` 等は、その index signature 経由でしか
 * 解決できず静的には `any` になる。実行時 typeof ガードで narrow してから
 * 呼び出す/bind することで any の伝播を断つ。
 */
function isCallableFunction(
  value: unknown,
): value is (...args: never[]) => unknown {
  return typeof value === "function";
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
  const rawGetComputedStyle: unknown = window["getComputedStyle"];
  if (!isCallableFunction(rawGetComputedStyle)) {
    throw new Error(
      "jsdom window is missing getComputedStyle (unexpected jsdom version?)",
    );
  }

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
    getComputedStyle: rawGetComputedStyle.bind(window),
    DOMParser: window.DOMParser,
  };
}

function createHeadlessJsdom(): JSDOM {
  const { JSDOM } = loadJsdomModule();
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
 *
 * `callback` は必ず同期関数であること。Node.js はシングルスレッドのため、
 * グローバル設定→呼び出し→restore が同一 tick 内で完結する限り、同時に
 * 実行中の他リクエストの callback がこの区間に割り込むことはない
 * （global mutation が安全な理由）。だが `callback` が async 関数だと、
 * 最初の `await` で一旦制御が返り、restore 済み（または他リクエストが
 * 上書きした）グローバルの下で続きが実行されてしまう。戻り値が Promise
 * なら即座に throw して黙って壊れることを防ぐ（callback の戻り値型が
 * union の場合に conditional type の分配で誤検知するため、型レベルでの
 * 禁止ではなくランタイムチェックのみで守る）。
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
    const result = callback();
    if (result instanceof Promise) {
      throw new Error(
        "withLexicalHeadlessDom には同期関数のみ渡せます（async callback は" +
          " restore 後に続きが実行され、DOM グローバルが他リクエストと" +
          "競合する可能性があるため禁止）。",
      );
    }
    return result;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      defineGlobal(globalThis, key, value);
    }
    const jsdomWindow = globals["window"] as JSDOM["window"] | undefined;
    const rawClose: unknown = jsdomWindow?.["close"];
    if (isCallableFunction(rawClose)) {
      rawClose.call(jsdomWindow);
    }
  }
}
