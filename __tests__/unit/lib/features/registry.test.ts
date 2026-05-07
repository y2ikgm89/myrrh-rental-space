import { describe, test, expect } from "bun:test";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  isFeatureModule,
  type FeatureModule,
} from "@/shared/lib/features/registry";

describe("FEATURE_MODULES_LIST", () => {
  test("9 module を含む", () => {
    expect(FEATURE_MODULES_LIST).toHaveLength(9);
  });

  test("全 module 名が小文字英数字 hyphen のみ", () => {
    for (const id of FEATURE_MODULES_LIST) {
      expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  test("FEATURE_MODULES の key と一致する", () => {
    const moduleKeys: string[] = Object.keys(FEATURE_MODULES);
    const listValues: string[] = [...FEATURE_MODULES_LIST];
    expect(moduleKeys.sort()).toEqual(listValues.sort());
  });
});

describe("FEATURE_MODULES metadata", () => {
  test("全 module に label と description がある", () => {
    for (const id of FEATURE_MODULES_LIST) {
      const def = FEATURE_MODULES[id];
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
    }
  });

  test("requires は既存 module のみを参照する", () => {
    const allIds = new Set<string>(FEATURE_MODULES_LIST);
    for (const id of FEATURE_MODULES_LIST) {
      const def = FEATURE_MODULES[id];
      for (const req of def.requires ?? []) {
        expect(allIds.has(req)).toBe(true);
      }
    }
  });

  test("循環依存がない（reservation/reviews → spaces）", () => {
    expect(FEATURE_MODULES.reservation.requires).toContain("spaces");
    expect(FEATURE_MODULES.reviews.requires).toContain("spaces");
    expect(FEATURE_MODULES.spaces.requires ?? []).toEqual([]);
  });

  test("publicRoutes / pageSlugs / sectionTypes / templates / cronPaths が配列", () => {
    for (const id of FEATURE_MODULES_LIST) {
      const def = FEATURE_MODULES[id];
      expect(Array.isArray(def.publicRoutes)).toBe(true);
      expect(Array.isArray(def.pageSlugs)).toBe(true);
      expect(Array.isArray(def.sectionTypes)).toBe(true);
      expect(Array.isArray(def.templates)).toBe(true);
      expect(Array.isArray(def.cronPaths)).toBe(true);
    }
  });
});

describe("isFeatureModule", () => {
  test("登録済み module を true と判定する", () => {
    for (const id of FEATURE_MODULES_LIST) {
      expect(isFeatureModule(id)).toBe(true);
    }
  });

  test("未登録の文字列を false と判定する", () => {
    expect(isFeatureModule("unknown")).toBe(false);
    expect(isFeatureModule("")).toBe(false);
    expect(isFeatureModule("Spaces")).toBe(false); // case sensitive
  });

  test("型 narrow が効く", () => {
    const value: string = "spaces";
    if (isFeatureModule(value)) {
      const narrowed: FeatureModule = value;
      expect(narrowed).toBe("spaces");
    }
  });
});
