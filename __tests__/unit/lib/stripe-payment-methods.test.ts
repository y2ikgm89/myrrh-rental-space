import { describe, expect, test } from "bun:test";
import {
  STRIPE_PAYMENT_METHOD_TYPE_VALUES,
  filterCompatiblePaymentMethods,
  isPaymentMethodAllowedForCurrency,
  isStripePaymentMethodType,
} from "@/shared/lib/stripe-payment-methods";

describe("isStripePaymentMethodType", () => {
  test("許容値は true", () => {
    for (const value of STRIPE_PAYMENT_METHOD_TYPE_VALUES) {
      expect(isStripePaymentMethodType(value)).toBe(true);
    }
  });

  test("未定義文字列 / 非文字列 / null / undefined は false", () => {
    expect(isStripePaymentMethodType("paypal")).toBe(false);
    expect(isStripePaymentMethodType("")).toBe(false);
    expect(isStripePaymentMethodType(42)).toBe(false);
    expect(isStripePaymentMethodType(null)).toBe(false);
    expect(isStripePaymentMethodType(undefined)).toBe(false);
  });
});

describe("isPaymentMethodAllowedForCurrency", () => {
  test("card は全通貨で許容", () => {
    expect(isPaymentMethodAllowedForCurrency("card", "jpy")).toBe(true);
    expect(isPaymentMethodAllowedForCurrency("card", "usd")).toBe(true);
    expect(isPaymentMethodAllowedForCurrency("card", "cny")).toBe(true);
  });

  test("konbini は JPY のみ許容", () => {
    expect(isPaymentMethodAllowedForCurrency("konbini", "jpy")).toBe(true);
    expect(isPaymentMethodAllowedForCurrency("konbini", "usd")).toBe(false);
    expect(isPaymentMethodAllowedForCurrency("konbini", "eur")).toBe(false);
  });

  test("customer_balance は JPY/USD/EUR/GBP のみ許容", () => {
    expect(isPaymentMethodAllowedForCurrency("customer_balance", "jpy")).toBe(
      true,
    );
    expect(isPaymentMethodAllowedForCurrency("customer_balance", "usd")).toBe(
      true,
    );
    expect(isPaymentMethodAllowedForCurrency("customer_balance", "eur")).toBe(
      true,
    );
    expect(isPaymentMethodAllowedForCurrency("customer_balance", "gbp")).toBe(
      true,
    );
    expect(isPaymentMethodAllowedForCurrency("customer_balance", "cny")).toBe(
      false,
    );
  });

  test("currency は case-insensitive で判定される", () => {
    expect(isPaymentMethodAllowedForCurrency("konbini", "JPY")).toBe(true);
    expect(isPaymentMethodAllowedForCurrency("customer_balance", "EUR")).toBe(
      true,
    );
  });
});

describe("filterCompatiblePaymentMethods", () => {
  test("JPY で全 method 許容 (card/konbini/customer_balance/link 全部)", () => {
    const result = filterCompatiblePaymentMethods(
      ["card", "konbini", "customer_balance", "link"],
      "jpy",
    );
    expect(result).toEqual(["card", "konbini", "customer_balance", "link"]);
  });

  test("USD 切替で konbini が除外される (Codex PR #1045 P2 regression)", () => {
    const result = filterCompatiblePaymentMethods(
      ["card", "konbini", "customer_balance"],
      "usd",
    );
    expect(result).toEqual(["card", "customer_balance"]);
  });

  test("CNY 切替で konbini と customer_balance が除外される", () => {
    const result = filterCompatiblePaymentMethods(
      ["card", "konbini", "customer_balance", "link"],
      "cny",
    );
    expect(result).toEqual(["card", "link"]);
  });

  test("全 method が非対応でも空配列を返す (caller 側で最低 1 件契約を守る責務)", () => {
    // konbini のみ選択で non-JPY 通貨に切替 → 空配列
    const result = filterCompatiblePaymentMethods(["konbini"], "usd");
    expect(result).toEqual([]);
  });
});
