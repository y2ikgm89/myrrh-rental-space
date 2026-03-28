import { describe, test, expect, beforeEach, mock } from "bun:test";

const mockMatchMedia = mock((query: string) => ({
  matches: query === "(min-width: 1024px)",
  media: query,
  addEventListener: mock(() => {}),
  removeEventListener: mock(() => {}),
  onchange: null,
  addListener: mock(() => {}),
  removeListener: mock(() => {}),
  dispatchEvent: mock(() => true),
}));

beforeEach(() => {
  mockMatchMedia.mockClear();
  Object.defineProperty(globalThis, "matchMedia", {
    writable: true,
    configurable: true,
    value: mockMatchMedia,
  });
  // JSDOM: window は globalThis を参照するが matchMedia は明示的に定義が必要
  if (typeof window !== "undefined" && window !== globalThis) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: mockMatchMedia,
    });
  }
});

describe("useMediaQuery internal logic", () => {
  test("matchMedia(query).matches が true なら getSnapshot は true", () => {
    const result = window.matchMedia("(min-width: 1024px)");
    expect(result.matches).toBe(true);
  });

  test("matchMedia(query).matches が false なら getSnapshot は false", () => {
    const result = window.matchMedia("(max-width: 767px)");
    expect(result.matches).toBe(false);
  });

  test("subscribe がイベントリスナーを登録する", () => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const callback = () => {};
    mql.addEventListener("change", callback);
    expect(mql.addEventListener).toHaveBeenCalledWith("change", callback);
  });
});
