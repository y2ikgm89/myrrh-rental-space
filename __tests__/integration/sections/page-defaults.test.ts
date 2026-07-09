/**
 * Page defaults integration test
 *
 * `DEFAULT_PAGE_SECTIONS` が `sections/registry` の SSoT と整合していることを検証する。
 * 列挙の重複（drift 源）を持たず、registry に登録された type のみを参照することだけを保証する。
 *
 * 個別 SectionType の存在 / カテゴリ別件数 / `validateSectionConfig` の網羅は
 * `__tests__/unit/domain/sections/registry.test.ts` が canonical SSoT として担当する。
 */

import { describe, expect, test } from "bun:test";

import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import { getSectionDefinition } from "@/shared/lib/sections/registry";

describe("DEFAULT_PAGE_SECTIONS", () => {
  test("home defaults は legacy homepage-* type を含まない", () => {
    const home = DEFAULT_PAGE_SECTIONS["home"] ?? [];
    const homepagePrefixed = home.filter((s) => s.type.startsWith("homepage-"));
    expect(homepagePrefixed).toHaveLength(0);
  });

  test("home defaults の order は重複なしの整数（page-hero sentinel order=-1 を許容）", () => {
    const home = DEFAULT_PAGE_SECTIONS["home"] ?? [];
    const orders = home.map((s) => s.order);
    expect(new Set(orders).size).toBe(orders.length);
    // page-hero は構造的に先頭固定 (order=-1 sentinel; reorderPageSectionsCommand と整合)。
    // 他 type は非負整数。
    for (const section of home) {
      expect(Number.isInteger(section.order)).toBe(true);
      if (section.type === "page-hero") {
        expect(section.order).toBe(-1);
      } else {
        expect(section.order).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("全 page slug の defaults が registry に登録された type のみ参照する", () => {
    for (const [slug, sections] of Object.entries(DEFAULT_PAGE_SECTIONS)) {
      for (const section of sections ?? []) {
        const def = getSectionDefinition(section.type);
        expect(def, `${slug}.${section.type} not registered`).toBeDefined();
      }
    }
  });

  test("各 page slug 内で order は重複しない", () => {
    for (const [slug, sections] of Object.entries(DEFAULT_PAGE_SECTIONS)) {
      const orders = (sections ?? []).map((s) => s.order);
      expect(new Set(orders).size, `${slug} has duplicate order values`).toBe(
        orders.length,
      );
    }
  });

  test("全 page slug の defaults は各 section schema の正規 config である", () => {
    for (const [slug, sections] of Object.entries(DEFAULT_PAGE_SECTIONS)) {
      for (const section of sections ?? []) {
        const def = getSectionDefinition(section.type);
        expect(def, `${slug}.${section.type} not registered`).toBeDefined();
        if (!def) continue;

        const result = def.configSchema.safeParse(section.config);
        expect(
          result.success,
          `${slug}.${section.type} default config should be canonical`,
        ).toBe(true);
      }
    }
  });
});
