/**
 * Stripe unit_amount ↔ アプリ単位 変換 helper の回帰テスト。
 *
 * PR #1126 Codex P1 (webhook 経由 Refund が Stripe cents を app 単位に逆変換していない)
 * および PR #1130 Codex P2 (event registration 側 同型 bug) の SSoT。
 *
 * `applyChargeRefundIdempotent` / `applyEventChargeRefundIdempotent` が呼ぶ
 * `fromStripeUnitAmount` が正しく通貨判定と 100 倍/等倍を切り替えることを機械強制する。
 */
import { describe, test, expect } from "bun:test";
import {
  ZERO_DECIMAL_CURRENCIES,
  toStripeUnitAmount,
  fromStripeUnitAmount,
} from "@/shared/lib/stripe-shared";

describe("Stripe unit_amount 変換", () => {
  describe("ZERO_DECIMAL_CURRENCIES", () => {
    test("Stripe 公式 17 通貨を全て含む", () => {
      // https://docs.stripe.com/currencies#zero-decimal
      const expected = [
        "bif",
        "clp",
        "djf",
        "gnf",
        "isk",
        "jpy",
        "kmf",
        "krw",
        "mga",
        "pyg",
        "rwf",
        "ugx",
        "vnd",
        "vuv",
        "xaf",
        "xof",
        "xpf",
      ];
      for (const currency of expected) {
        expect(ZERO_DECIMAL_CURRENCIES.has(currency)).toBe(true);
      }
      expect(ZERO_DECIMAL_CURRENCIES.size).toBe(expected.length);
    });
  });

  describe("toStripeUnitAmount", () => {
    test("JPY はそのまま (ゼロ小数点通貨)", () => {
      expect(toStripeUnitAmount(5000, "jpy")).toBe(5000);
    });

    test("USD は 100 倍 (dollars → cents)", () => {
      expect(toStripeUnitAmount(50, "usd")).toBe(5000);
    });

    test("EUR は 100 倍", () => {
      expect(toStripeUnitAmount(19.99, "eur")).toBe(1999);
    });

    test("case-insensitive で通貨判定 (JPY / jpy / JpY 全て同結果)", () => {
      expect(toStripeUnitAmount(5000, "JPY")).toBe(5000);
      expect(toStripeUnitAmount(5000, "JpY")).toBe(5000);
    });

    test("未知通貨は default で 100 倍 (安全側 = 小数点あり通貨扱い)", () => {
      expect(toStripeUnitAmount(50, "xxx")).toBe(5000);
    });

    test("端数は round (0.005 up)", () => {
      expect(toStripeUnitAmount(0.005, "usd")).toBe(1);
      expect(toStripeUnitAmount(0.004, "usd")).toBe(0);
    });
  });

  describe("fromStripeUnitAmount", () => {
    test("JPY はそのまま", () => {
      expect(fromStripeUnitAmount(5000, "jpy")).toBe(5000);
    });

    test("USD は 100 で割る (cents → dollars)", () => {
      expect(fromStripeUnitAmount(5000, "usd")).toBe(50);
    });

    test("EUR も 100 で割る", () => {
      expect(fromStripeUnitAmount(1999, "eur")).toBe(19.99);
    });

    test("case-insensitive で通貨判定", () => {
      expect(fromStripeUnitAmount(5000, "USD")).toBe(50);
    });

    test("未知通貨は default で 100 で割る", () => {
      expect(fromStripeUnitAmount(5000, "xxx")).toBe(50);
    });
  });

  describe("to/from 対称性", () => {
    test("JPY: to → from で元に戻る", () => {
      const original = 5000;
      const roundtrip = fromStripeUnitAmount(
        toStripeUnitAmount(original, "jpy"),
        "jpy",
      );
      expect(roundtrip).toBe(original);
    });

    test("USD: to → from で元に戻る (整数 cents 前提)", () => {
      const original = 50;
      const roundtrip = fromStripeUnitAmount(
        toStripeUnitAmount(original, "usd"),
        "usd",
      );
      expect(roundtrip).toBe(original);
    });

    test("USD: 小数入力の to → from も 0.01 単位で戻る", () => {
      const original = 19.99;
      const roundtrip = fromStripeUnitAmount(
        toStripeUnitAmount(original, "usd"),
        "usd",
      );
      expect(roundtrip).toBe(original);
    });
  });

  describe("実障害の regression (PR #1126 P1)", () => {
    test("USD の webhook payload $50 (=5000 cents) を fromStripeUnitAmount すると 50 (dollars)", () => {
      // これが 5000 のまま Refund.amount に保存されていた bug の regression pin。
      // 100 倍で保存されると refund 集計 (SUM) が 100 倍化し、
      // reservation.totalPrice との比較で全額返金判定 (isFullRefund) が壊れる。
      const stripeUnitAmount = 5000;
      const appUnitAmount = fromStripeUnitAmount(stripeUnitAmount, "usd");
      expect(appUnitAmount).toBe(50);
      expect(appUnitAmount).not.toBe(5000);
    });

    test("JPY の webhook payload ¥5000 (=5000 unit) は元々一致するが helper 経由でも変わらない", () => {
      // JPY で偶然 bug が顕在化しなかった理由の pin。
      const stripeUnitAmount = 5000;
      const appUnitAmount = fromStripeUnitAmount(stripeUnitAmount, "jpy");
      expect(appUnitAmount).toBe(5000);
    });
  });
});
