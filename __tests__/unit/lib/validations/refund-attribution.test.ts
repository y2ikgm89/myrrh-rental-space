import { describe, expect, test } from "bun:test";
import {
  isValidRefundedByType,
  REFUNDED_BY_TYPE,
  REFUNDED_BY_TYPE_LABELS,
} from "@/shared/lib/validations/enums/refund-attribution";

describe("REFUNDED_BY_TYPE", () => {
  test("AUTO_CAPACITY_RACE を含み、LABELS と 1:1", () => {
    expect(REFUNDED_BY_TYPE.AUTO_CAPACITY_RACE).toBe("AUTO_CAPACITY_RACE");
    expect(Object.keys(REFUNDED_BY_TYPE).sort()).toEqual(
      Object.keys(REFUNDED_BY_TYPE_LABELS).sort(),
    );
    for (const value of Object.values(REFUNDED_BY_TYPE)) {
      expect(REFUNDED_BY_TYPE_LABELS[value].length).toBeGreaterThan(0);
    }
  });

  test("isValidRefundedByType は既知値のみ true", () => {
    expect(isValidRefundedByType("AUTO_CAPACITY_RACE")).toBe(true);
    expect(isValidRefundedByType("AUTO_ON_CANCEL")).toBe(true);
    expect(isValidRefundedByType("ADMIN")).toBe(true);
    expect(isValidRefundedByType("STRIPE_DASHBOARD")).toBe(true);
    expect(isValidRefundedByType("UNKNOWN")).toBe(false);
    expect(isValidRefundedByType(null)).toBe(false);
  });
});
