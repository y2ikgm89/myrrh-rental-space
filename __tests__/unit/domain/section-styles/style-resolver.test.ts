/**
 * Phase B.P2 stub — exercises only the hardcoded fallback layer.
 * Full 4-tier cascade resolver coverage arrives with Phase B.P3.
 */
import { describe, test, expect } from "bun:test";
import {
  DEFAULT_SECTION_STYLE,
  SECTION_STYLE_PRESETS,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";

describe("DEFAULT_SECTION_STYLE", () => {
  test("contains every payload group", () => {
    const keys: Array<keyof SectionStylePayload> = [
      "spacing",
      "background",
      "container",
      "typography",
      "animation",
    ];
    for (const key of keys) {
      expect(DEFAULT_SECTION_STYLE[key]).toBeDefined();
    }
  });

  test("matches Phase A SectionWrapper defaults (paddingTop/Bottom = md, maxWidth = xl)", () => {
    expect(DEFAULT_SECTION_STYLE.spacing.paddingTop).toBe("md");
    expect(DEFAULT_SECTION_STYLE.spacing.paddingBottom).toBe("md");
    expect(DEFAULT_SECTION_STYLE.container.maxWidth).toBe("xl");
    expect(DEFAULT_SECTION_STYLE.background.type).toBe("default");
    expect(DEFAULT_SECTION_STYLE.background.overlayOpacity).toBe(0);
    expect(DEFAULT_SECTION_STYLE.typography.textAlign).toBe("left");
    expect(DEFAULT_SECTION_STYLE.animation.preset).toBe("fade");
  });

  test("is frozen so downstream layers cannot mutate the fallback", () => {
    expect(Object.isFrozen(DEFAULT_SECTION_STYLE)).toBe(true);
  });
});

describe("SECTION_STYLE_PRESETS", () => {
  test("lists the canonical 5 editorial presets from ADR 0017", () => {
    const names = new Set<string>(Object.values(SECTION_STYLE_PRESETS));
    expect(names.size).toBe(5);
    expect(names.has("Editorial - Standard")).toBe(true);
    expect(names.has("Editorial - Compact")).toBe(true);
    expect(names.has("Editorial - CTA")).toBe(true);
    expect(names.has("Editorial - Hero Adjacent")).toBe(true);
    expect(names.has("Editorial - Full Bleed")).toBe(true);
  });

  test("preset names are unique so the Prisma `name` UNIQUE constraint holds", () => {
    const values = Object.values(SECTION_STYLE_PRESETS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});
