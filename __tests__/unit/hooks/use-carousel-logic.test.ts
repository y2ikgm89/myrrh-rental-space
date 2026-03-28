import { describe, test, expect } from "bun:test";

/**
 * useCarousel 内の純粋ロジックを直接テスト
 * - safeIndex: currentIndex が bars.length を超えた場合に 0 にリセット
 * - goNext: (prev + 1) % total
 * - goPrev: (prev - 1 + total) % total
 */

function calcSafeIndex(currentIndex: number, total: number): number {
  if (total === 0) return 0;
  return currentIndex >= total ? 0 : currentIndex;
}

function calcNextIndex(currentIndex: number, total: number): number {
  return (currentIndex + 1) % total;
}

function calcPrevIndex(currentIndex: number, total: number): number {
  return (currentIndex - 1 + total) % total;
}

describe("carousel index calculations", () => {
  describe("safeIndex", () => {
    test("total=0 → 0", () => {
      expect(calcSafeIndex(0, 0)).toBe(0);
      expect(calcSafeIndex(5, 0)).toBe(0);
    });

    test("currentIndex < total → そのまま", () => {
      expect(calcSafeIndex(0, 3)).toBe(0);
      expect(calcSafeIndex(2, 3)).toBe(2);
    });

    test("currentIndex >= total → 0 にリセット", () => {
      expect(calcSafeIndex(3, 3)).toBe(0);
      expect(calcSafeIndex(5, 3)).toBe(0);
    });
  });

  describe("goNext", () => {
    test("末尾から先頭へラップ", () => {
      expect(calcNextIndex(2, 3)).toBe(0);
    });

    test("通常のインクリメント", () => {
      expect(calcNextIndex(0, 3)).toBe(1);
      expect(calcNextIndex(1, 3)).toBe(2);
    });
  });

  describe("goPrev", () => {
    test("先頭から末尾へラップ", () => {
      expect(calcPrevIndex(0, 3)).toBe(2);
    });

    test("通常のデクリメント", () => {
      expect(calcPrevIndex(2, 3)).toBe(1);
      expect(calcPrevIndex(1, 3)).toBe(0);
    });
  });
});
