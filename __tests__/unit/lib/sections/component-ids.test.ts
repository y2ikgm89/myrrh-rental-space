import { describe, expect, test } from "bun:test";
import { StandardComponentId } from "@/shared/lib/sections/component-ids";

describe("StandardComponentId", () => {
  test("all values are kebab-case strings", () => {
    for (const value of Object.values(StandardComponentId)) {
      expect(value).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  test("contains all 17 standard section types", () => {
    expect(Object.keys(StandardComponentId)).toHaveLength(17);
  });

  test("values are unique", () => {
    const values = Object.values(StandardComponentId);
    expect(new Set(values).size).toBe(values.length);
  });
});
