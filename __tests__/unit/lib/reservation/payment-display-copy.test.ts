import { describe, expect, test } from "bun:test";
import { getReservationPaymentDisplayCopy } from "@/shared/lib/reservation/payment-display-copy";

describe("getReservationPaymentDisplayCopy", () => {
  test("returns online payment copy when available", () => {
    expect(getReservationPaymentDisplayCopy(true)).toBe(
      "オンライン決済に対応しています",
    );
  });

  test("returns no prepayment copy when online payment unavailable", () => {
    expect(getReservationPaymentDisplayCopy(false)).toBe("事前決済不要");
  });
});
