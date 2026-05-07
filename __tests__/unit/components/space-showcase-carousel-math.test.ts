import { describe, expect, test } from "bun:test";

import {
  computeDistance,
  getCardStyle,
  shortestStep,
  wrapIndex,
} from "@/app/(public)/_components/space-showcase/_carousel-math";

describe("wrapIndex", () => {
  test("正の index は count で剰余を返す", () => {
    expect(wrapIndex(5, 3)).toBe(2);
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(7, 5)).toBe(2);
  });

  test("負の index は正にラップする", () => {
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(-4, 3)).toBe(2);
    expect(wrapIndex(-1, 5)).toBe(4);
  });

  test("count = 0 / 負は 0 を返す（防御）", () => {
    expect(wrapIndex(2, 0)).toBe(0);
    expect(wrapIndex(2, -1)).toBe(0);
  });

  test("0 はそのまま 0 を返す", () => {
    expect(wrapIndex(0, 5)).toBe(0);
  });
});

describe("computeDistance", () => {
  test("active と一致は 0", () => {
    expect(computeDistance(2, 2, 5)).toBe(0);
  });

  test("隣接カードは 1", () => {
    expect(computeDistance(2, 1, 5)).toBe(1);
    expect(computeDistance(2, 3, 5)).toBe(1);
  });

  test("ラップアラウンドの最短距離を返す", () => {
    expect(computeDistance(0, 4, 5)).toBe(1);
    expect(computeDistance(4, 0, 5)).toBe(1);
    expect(computeDistance(0, 3, 5)).toBe(2);
  });

  test("count = 0 は 0 を返す（防御）", () => {
    expect(computeDistance(0, 0, 0)).toBe(0);
  });
});

describe("getCardStyle", () => {
  test("距離 0 は最前面 + scale 1 + opacity 1", () => {
    expect(getCardStyle(0)).toEqual({ zIndex: 30, scale: 1, opacity: 1 });
  });

  test("距離 1 は scale 0.9 / opacity 0.85", () => {
    expect(getCardStyle(1)).toEqual({ zIndex: 20, scale: 0.9, opacity: 0.85 });
  });

  test("距離 2 は scale 0.82 / opacity 0.6", () => {
    expect(getCardStyle(2)).toEqual({ zIndex: 10, scale: 0.82, opacity: 0.6 });
  });

  test("距離 3 以上は最背面 + opacity 0.25", () => {
    expect(getCardStyle(3)).toEqual({ zIndex: 5, scale: 0.75, opacity: 0.25 });
    expect(getCardStyle(99)).toEqual({ zIndex: 5, scale: 0.75, opacity: 0.25 });
  });
});

describe("shortestStep", () => {
  test("一致は 0", () => {
    expect(shortestStep(0, 0, 5)).toBe(0);
    expect(shortestStep(3, 3, 5)).toBe(0);
  });

  test("正方向の最短距離を返す", () => {
    expect(shortestStep(0, 1, 5)).toBe(1);
    expect(shortestStep(0, 2, 5)).toBe(2);
  });

  test("負方向の最短距離を返す", () => {
    expect(shortestStep(2, 1, 5)).toBe(-1);
    expect(shortestStep(2, 0, 5)).toBe(-2);
  });

  test("ラップアラウンドの最短方向を選ぶ", () => {
    expect(shortestStep(0, 4, 5)).toBe(-1);
    expect(shortestStep(4, 0, 5)).toBe(1);
    // count=7 で 1→5 は forward 4 / backward 3 → backward 選択
    expect(shortestStep(1, 5, 7)).toBe(-3);
  });

  test("count = 0 は 0 を返す（防御）", () => {
    expect(shortestStep(0, 1, 0)).toBe(0);
  });
});
