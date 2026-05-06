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

  test("home defaults の order は重複なしの非負整数", () => {
    const home = DEFAULT_PAGE_SECTIONS["home"] ?? [];
    const orders = home.map((s) => s.order);
    expect(new Set(orders).size).toBe(orders.length);
    for (const o of orders) {
      expect(o).toBeGreaterThanOrEqual(0);
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
});
