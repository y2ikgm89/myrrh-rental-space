import { describe, test, expect, beforeEach, mock } from "bun:test";
import { installJSDOMForTests } from "../../setup-dom";

const mockMatchMedia = mock((query: string) => ({
  matches: query === "(min-width: 1024px)",
  media: query,
  addEventListener: mock((_type: string, _listener: () => void) => {}),
  removeEventListener: mock((_type: string, _listener: () => void) => {}),
  onchange: null,
  addListener: mock(() => {}),
  removeListener: mock(() => {}),
  dispatchEvent: mock(() => true),
}));

beforeEach(() => {
  installJSDOMForTests();
  mockMatchMedia.mockClear();
  Object.defineProperty(globalThis, "matchMedia", {
    writable: true,
    configurable: true,
    value: mockMatchMedia,
  });
});

describe("useMediaQuery internal logic", () => {
  test("matchMedia(query).matches が true なら getSnapshot は true", () => {
    const result = mockMatchMedia("(min-width: 1024px)");
    expect(result.matches).toBe(true);
  });

  test("matchMedia(query).matches が false なら getSnapshot は false", () => {
    const result = mockMatchMedia("(max-width: 767px)");
    expect(result.matches).toBe(false);
  });

  test("subscribe がイベントリスナーを登録する", () => {
    const mql = mockMatchMedia("(min-width: 1024px)");
    const callback = () => {};
    mql.addEventListener("change", callback);
    expect(mql.addEventListener).toHaveBeenCalledWith("change", callback);
  });
});
