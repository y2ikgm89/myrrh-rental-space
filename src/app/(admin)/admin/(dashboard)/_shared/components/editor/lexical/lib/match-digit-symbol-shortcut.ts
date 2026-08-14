/**
 * Ctrl+Shift+digit / Slash ショートカットの判定。
 *
 * 数字・記号は Shift で key が配列依存のグリフ（@ " & * ? ) など）になる。
 * Lexical の `isExactShortcutMatch` は 1 文字 ASCII の key だと code
 * フォールバックを使わないため、ここは event.code だけを見る（F-100）。
 */

export type DigitSymbolShortcut =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6 }
  | { type: "ordered-list" }
  | { type: "unordered-list" }
  | { type: "inspector" }
  | { type: "help" };

export type DigitSymbolShortcutEvent = {
  key: string;
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

const DIGIT_OR_NUMPAD = /^(?:Digit|Numpad)([0-8])$/;

export function matchDigitSymbolShortcut(
  event: DigitSymbolShortcutEvent,
): DigitSymbolShortcut | null {
  if (event.code === "Slash") {
    return { type: "help" };
  }

  const matched = DIGIT_OR_NUMPAD.exec(event.code);
  if (!matched) {
    return null;
  }

  const n = Number(matched[1]);
  if (n === 0) {
    return { type: "inspector" };
  }
  if (n >= 1 && n <= 6) {
    return { type: "heading", level: n as 1 | 2 | 3 | 4 | 5 | 6 };
  }
  if (n === 7) {
    return { type: "ordered-list" };
  }
  if (n === 8) {
    return { type: "unordered-list" };
  }
  return null;
}
