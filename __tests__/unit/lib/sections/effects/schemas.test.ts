import { describe, expect, test } from "bun:test";
import {
  sectionEffectConfigSchema,
  pageEffectConfigSchema,
} from "@/shared/lib/sections/effects/schemas";

describe("sectionEffectConfigSchema", () => {
  test("parses empty object to default", () => {
    const result = sectionEffectConfigSchema.parse({});
    expect(result).toEqual({ overlays: [] });
  });

  test("parses valid overlay config", () => {
    const input = {
      overlays: [{ effectId: "pixi-grain", params: { intensity: 0.05 } }],
    };
    const result = sectionEffectConfigSchema.parse(input);
    expect(result.overlays).toHaveLength(1);
    expect(result.overlays[0].effectId).toBe("pixi-grain");
  });
});

describe("pageEffectConfigSchema", () => {
  test("parses empty object to defaults", () => {
    const result = pageEffectConfigSchema.parse({});
    expect(result).toEqual({ background: null, overlay: null });
  });

  test("parses valid page effect config", () => {
    const input = {
      background: { effectId: "floating-geometry", params: { count: 50 } },
      overlay: null,
    };
    const result = pageEffectConfigSchema.parse(input);
    expect(result.background).toBeTruthy();
    if (result.background) {
      expect(result.background.effectId).toBe("floating-geometry");
    }
  });
});
