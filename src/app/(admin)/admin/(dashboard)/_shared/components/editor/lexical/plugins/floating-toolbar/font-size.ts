/**
 * Font Size Constants (公式Playgroundパターン準拠)
 */

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;
export const DEFAULT_FONT_SIZE = 16;

export function calculateNextFontSize(
  currentSize: number,
  direction: "increment" | "decrement",
): number {
  let step: number;
  if (currentSize >= 48) {
    step = 12;
  } else if (currentSize >= 24) {
    step = 4;
  } else if (currentSize >= 14) {
    step = 2;
  } else {
    step = 1;
  }
  const nextSize =
    direction === "increment" ? currentSize + step : currentSize - step;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, nextSize));
}
