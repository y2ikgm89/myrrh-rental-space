// bootstrap: register all definitions
import "@/public/lib/sections/register-standard-sections";

import { describe, expect, test } from "bun:test";
import {
  getSectionDefinition,
  getRegisteredComponentIds,
  getSectionsByCategory,
} from "@/shared/lib/sections/registry";
import { StandardComponentId } from "@/shared/lib/sections/component-ids";

describe("sectionRegistry", () => {
  test("all 17 standard sections are registered", () => {
    const ids = getRegisteredComponentIds();
    expect(ids.length).toBeGreaterThanOrEqual(17);
    for (const id of Object.values(StandardComponentId)) {
      expect(ids).toContain(id);
    }
  });

  test("getSectionDefinition returns definition for valid id", () => {
    const def = getSectionDefinition("hero-parallax");
    if (!def) throw new Error("Expected hero-parallax definition to exist");
    expect(def.id).toBe("hero-parallax");
    expect(def.meta.label).toBeTruthy();
  });

  test("getSectionDefinition returns undefined for unknown id", () => {
    expect(getSectionDefinition("nonexistent")).toBeUndefined();
  });

  test("getSectionsByCategory groups correctly", () => {
    const categories = getSectionsByCategory();
    expect(categories.length).toBeGreaterThanOrEqual(4);
    const heroCategory = categories.find((c) => c.category === "hero");
    if (!heroCategory) throw new Error("Expected hero category to exist");
    expect(heroCategory.sections.length).toBeGreaterThanOrEqual(2);
  });

  test("all definitions have valid configSchema (defaultConfig parses cleanly)", () => {
    for (const id of getRegisteredComponentIds()) {
      const def = getSectionDefinition(id);
      if (!def) throw new Error(`Expected definition for ${id} to exist`);
      // defaultConfig must round-trip through the schema without error
      expect(() => def.configSchema.parse(def.defaultConfig)).not.toThrow();
    }
  });
});
