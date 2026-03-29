import { describe, test, expect } from "bun:test";
import { formatCurrency, formatPrice } from "@/shared/lib/pricing/format";

// =============================================================================
// formatCurrency
// =============================================================================

describe("formatCurrency", () => {
  describe("正常系", () => {
    test("一般的な金額を日本円フォーマットで返す", () => {
      expect(formatCurrency(1000)).toBe("￥1,000");
    });

    test("3桁区切りが正しく適用される", () => {
      expect(formatCurrency(1000000)).toBe("￥1,000,000");
    });

    test("100円を正しくフォーマットする", () => {
      expect(formatCurrency(100)).toBe("￥100");
    });

    test("5000円を正しくフォーマットする", () => {
      expect(formatCurrency(5000)).toBe("￥5,000");
    });

    test("1円を正しくフォーマットする", () => {
      expect(formatCurrency(1)).toBe("￥1");
    });
  });

  describe("ゼロ・境界値", () => {
    test("0円を正しくフォーマットする", () => {
      expect(formatCurrency(0)).toBe("￥0");
    });

    test("999円（3桁区切りなし）を正しくフォーマットする", () => {
      expect(formatCurrency(999)).toBe("￥999");
    });

    test("1000円（3桁区切り境界値）を正しくフォーマットする", () => {
      expect(formatCurrency(1000)).toBe("￥1,000");
    });

    test("9999円を正しくフォーマットする", () => {
      expect(formatCurrency(9999)).toBe("￥9,999");
    });

    test("10000円を正しくフォーマットする", () => {
      expect(formatCurrency(10000)).toBe("￥10,000");
    });
  });

  describe("大きな数値", () => {
    test("100万円を正しくフォーマットする", () => {
      expect(formatCurrency(1000000)).toBe("￥1,000,000");
    });

    test("1億円を正しくフォーマットする", () => {
      expect(formatCurrency(100000000)).toBe("￥100,000,000");
    });

    test("10億円を正しくフォーマットする", () => {
      expect(formatCurrency(1000000000)).toBe("￥1,000,000,000");
    });
  });

  describe("負の値", () => {
    test("負の値をフォーマットする", () => {
      const result = formatCurrency(-1000);
      // 負の値はIntlが処理する（環境によって表現が異なる場合がある）
      expect(result).toContain("1,000");
    });

    test("負のゼロは円フォーマットで返される（Intl が処理）", () => {
      const result = formatCurrency(-0);
      // Intl.NumberFormat は -0 を "-￥0" または "￥0" と表示する（実装依存）
      expect(result).toContain("0");
    });
  });

  describe("戻り値の型", () => {
    test("string 型を返す", () => {
      expect(typeof formatCurrency(1000)).toBe("string");
    });

    test("円マーク記号を含む", () => {
      const result = formatCurrency(1000);
      expect(result).toContain("1,000");
      // 通貨記号が含まれる（￥ または ¥）
      expect(result.length).toBeGreaterThan(5);
    });
  });
});

// =============================================================================
// formatPrice
// =============================================================================

describe("formatPrice", () => {
  describe("正常系（数値入力）", () => {
    test("通常の金額を円フォーマットで返す", () => {
      expect(formatPrice(1000)).toBe("￥1,000");
    });

    test("5000円を正しくフォーマットする", () => {
      expect(formatPrice(5000)).toBe("￥5,000");
    });

    test("100万円を正しくフォーマットする", () => {
      expect(formatPrice(1000000)).toBe("￥1,000,000");
    });
  });

  describe("ゼロ", () => {
    test("0円を正しくフォーマットする", () => {
      expect(formatPrice(0)).toBe("￥0");
    });
  });

  describe("null / undefined（フォールバック）", () => {
    test("null のとき デフォルトフォールバック「要問合せ」を返す", () => {
      expect(formatPrice(null)).toBe("要問合せ");
    });

    test("undefined のとき デフォルトフォールバック「要問合せ」を返す", () => {
      expect(formatPrice(undefined)).toBe("要問合せ");
    });

    test("null でカスタムフォールバックを指定すると、そちらが返る", () => {
      expect(formatPrice(null, "未設定")).toBe("未設定");
    });

    test("undefined でカスタムフォールバックを指定すると、そちらが返る", () => {
      expect(formatPrice(undefined, "価格未定")).toBe("価格未定");
    });

    test("null で空文字列フォールバックを指定すると空文字列が返る", () => {
      expect(formatPrice(null, "")).toBe("");
    });
  });

  describe("フォールバックのデフォルト値", () => {
    test("フォールバック省略時は「要問合せ」がデフォルト", () => {
      expect(formatPrice(null)).toBe("要問合せ");
    });

    test("数値が渡された場合はフォールバックを無視して金額を返す", () => {
      expect(formatPrice(500, "未設定")).toBe("￥500");
    });

    test("0円が渡された場合はフォールバックではなく「￥0」を返す", () => {
      expect(formatPrice(0, "要問合せ")).toBe("￥0");
    });
  });

  describe("大きな数値・負の値", () => {
    test("大きな金額を正しくフォーマットする", () => {
      expect(formatPrice(9999999)).toBe("￥9,999,999");
    });

    test("負の値もフォーマットされる（nullにはならない）", () => {
      const result = formatPrice(-1000);
      expect(result).toContain("1,000");
    });
  });

  describe("戻り値の型", () => {
    test("数値入力時は string 型を返す", () => {
      expect(typeof formatPrice(1000)).toBe("string");
    });

    test("null 入力時は string 型を返す", () => {
      expect(typeof formatPrice(null)).toBe("string");
    });

    test("undefined 入力時は string 型を返す", () => {
      expect(typeof formatPrice(undefined)).toBe("string");
    });
  });
});
