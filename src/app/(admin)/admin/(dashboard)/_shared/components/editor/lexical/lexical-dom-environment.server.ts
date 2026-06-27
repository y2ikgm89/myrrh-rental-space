import "server-only";

type LexicalDomGlobals = {
  window: Window;
  document: Document;
  DOMParser: typeof DOMParser;
};

let cached: LexicalDomGlobals | undefined;

function defineGlobal(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

/** Lexical headless / HTML import 用 JSDOM bootstrap（server のみ）。 */
export function ensureLexicalDomEnvironment(): LexicalDomGlobals {
  if (cached !== undefined) {
    return cached;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports -- server-only bootstrap
  const { JSDOM } = require("jsdom") as typeof import("jsdom");
  const jsdom = new JSDOM(
    "<!DOCTYPE html><html><head></head><body></body></html>",
    {
      url: "http://localhost/",
      pretendToBeVisual: true,
    },
  );
  const jsdomWindow = jsdom.window;

  defineGlobal(globalThis, "window", jsdomWindow);
  defineGlobal(globalThis, "document", jsdomWindow["document"]);
  defineGlobal(globalThis, "DOMParser", jsdomWindow.DOMParser);
  defineGlobal(globalThis, "HTMLElement", jsdomWindow.HTMLElement);
  defineGlobal(globalThis, "Element", jsdomWindow.Element);
  defineGlobal(globalThis, "Node", jsdomWindow.Node);

  cached = {
    window: jsdomWindow as unknown as Window,
    document: jsdomWindow["document"],
    DOMParser: jsdomWindow.DOMParser,
  };

  return cached;
}
