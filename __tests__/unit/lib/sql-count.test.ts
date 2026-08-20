import { describe, expect, test } from "bun:test";

import { numberFromBigintCount } from "@/shared/lib/sql-count";

describe("numberFromBigintCount", () => {
  test("converts a bigint COUNT(*) that fits in a safe integer", () => {
    expect(numberFromBigintCount(0n)).toBe(0);
    expect(numberFromBigintCount(12n)).toBe(12);
    expect(numberFromBigintCount(undefined)).toBe(0);
  });

  test("throws when COUNT(*) is outside Number.MAX_SAFE_INTEGER", () => {
    expect(() =>
      numberFromBigintCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    ).toThrow(/MAX_SAFE_INTEGER/);
  });
});
