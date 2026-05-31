import { describe, expect, test } from "bun:test";
import { heroParallaxConfigSchema } from "@/shared/lib/sections/definitions/hero-parallax/schema";

describe("heroParallaxConfigSchema", () => {
  test("safeParse({}) が成立する（Section schema test contract）", () => {
    expect(heroParallaxConfigSchema.safeParse({}).success).toBe(true);
  });

  test("未使用 overlay フィールド（overlayStyle / overlayGradient）を持たない", () => {
    const result = heroParallaxConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect("overlayStyle" in result.data).toBe(false);
      expect("overlayGradient" in result.data).toBe(false);
    }
  });
});
