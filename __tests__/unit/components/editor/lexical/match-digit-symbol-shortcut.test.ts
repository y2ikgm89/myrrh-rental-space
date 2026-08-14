/**
 * F-100: Ctrl+Shift+digit / Slash は event.key ではなく event.code で判定する。
 *
 * Shift 付きの key は配列依存のグリフ（US なら @ " & * ? )）になるため、
 * `event.key >= "1" && event.key <= "6"` や `event.key === "0"` では発火しない。
 * `event.key === "Numpad0"` も死んでいる（Numpad0 は code）。
 */

import { describe, expect, test } from "bun:test";

import { matchDigitSymbolShortcut } from "@/admin/components/editor/lexical/lib/match-digit-symbol-shortcut";

describe("matchDigitSymbolShortcut", () => {
  test("Ctrl+Shift+2 は key が @ でも heading 2 になる", () => {
    expect(
      matchDigitSymbolShortcut({
        key: "@",
        code: "Digit2",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "heading", level: 2 });
  });

  test("Ctrl+Shift+2 は key が 2 のままでも heading 2 になる", () => {
    expect(
      matchDigitSymbolShortcut({
        key: "2",
        code: "Digit2",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "heading", level: 2 });
  });

  test("key の Numpad0 だけでは inspector にしない", () => {
    expect(
      matchDigitSymbolShortcut({
        key: "Numpad0",
        code: "Digit0",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "inspector" });
    expect(
      matchDigitSymbolShortcut({
        key: "Numpad0",
        code: "KeyA",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toBeNull();
  });

  test("code が Digit0 / Numpad0 なら inspector になる", () => {
    expect(
      matchDigitSymbolShortcut({
        key: ")",
        code: "Digit0",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "inspector" });
    expect(
      matchDigitSymbolShortcut({
        key: "0",
        code: "Numpad0",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "inspector" });
  });

  test("Ctrl+Shift+/ は key が ? でも help になる", () => {
    expect(
      matchDigitSymbolShortcut({
        key: "?",
        code: "Slash",
        ctrlKey: true,
        shiftKey: true,
      }),
    ).toEqual({ type: "help" });
  });
});
