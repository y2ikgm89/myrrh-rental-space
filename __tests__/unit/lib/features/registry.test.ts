import { describe, test, expect } from "bun:test";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  buildInitialFeatureModules,
  isFeatureModule,
  parseDisabledFeatureModulesEnv,
  type FeatureModule,
} from "@/shared/lib/features/registry";
import { SYSTEM_PAGE_SLUGS } from "@/shared/lib/validations/page";

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

describe("FEATURE_MODULES routing alignment (legacy /posts → /blog 移行)", () => {
  test("posts module は /blog に統一され /posts 残骸を持たない", () => {
    const posts = FEATURE_MODULES.posts;
    // pageSlugs は実 system page slug "blog" を指す（旧 "posts" は存在しない）
    expect(posts.pageSlugs).toEqual(["blog"]);
    // publicRoutes は /blog 系のみ。/posts は next.config の 308 redirect で処理する
    expect(posts.publicRoutes).toContain("/blog");
    expect(posts.publicRoutes).not.toContain("/posts");
  });

  test('events module は system page slug "events" を指す', () => {
    // events も spaces/news/blog 同様 Page-backed システムページ。
    // SYSTEM_PAGES への追加漏れで pageSlugs が宙吊りになる退行を防ぐ。
    expect(FEATURE_MODULES.events.pageSlugs).toEqual(["events"]);
    expect(SYSTEM_PAGE_SLUGS).toContain("events");
  });

  test("pageSlugs はすべて実在のシステムページ slug を指す", () => {
    // 全 module の pageSlugs が SYSTEM_PAGES に実在する slug を指す不変条件。
    // posts→blog / events 追加漏れと同種の「存在しない Page slug」退行を回帰防止。
    for (const id of FEATURE_MODULES_LIST) {
      for (const slug of FEATURE_MODULES[id].pageSlugs) {
        expect(SYSTEM_PAGE_SLUGS).toContain(slug);
      }
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

describe("parseDisabledFeatureModulesEnv", () => {
  test("undefined / 空文字 → 空配列", () => {
    expect(parseDisabledFeatureModulesEnv(undefined)).toEqual([]);
    expect(parseDisabledFeatureModulesEnv("")).toEqual([]);
  });

  test("単一 module を返す", () => {
    expect(parseDisabledFeatureModulesEnv("events")).toEqual(["events"]);
  });

  test("カンマ区切り複数 module を返す", () => {
    expect(parseDisabledFeatureModulesEnv("events,faq,posts")).toEqual([
      "events",
      "faq",
      "posts",
    ]);
  });

  test("前後の空白を trim する", () => {
    expect(parseDisabledFeatureModulesEnv("  events , faq , posts  ")).toEqual([
      "events",
      "faq",
      "posts",
    ]);
  });

  test("空エントリは除外する", () => {
    expect(parseDisabledFeatureModulesEnv("events,,faq,")).toEqual([
      "events",
      "faq",
    ]);
  });
});

describe("buildInitialFeatureModules", () => {
  test("disabledIds 未指定で全 9 module true", () => {
    const result = buildInitialFeatureModules();
    expect(result.spaces).toBe(true);
    expect(result.reservation).toBe(true);
    expect(result.events).toBe(true);
    expect(result.posts).toBe(true);
    expect(result.news).toBe(true);
    expect(result.faq).toBe(true);
    expect(result.access).toBe(true);
    expect(result.contact).toBe(true);
    expect(result.reviews).toBe(true);
  });

  test("空配列でも全 9 module true（undefined と同等）", () => {
    expect(buildInitialFeatureModules([])).toEqual(
      buildInitialFeatureModules(),
    );
  });

  test("disabledIds に含まれる module のみ false", () => {
    const result = buildInitialFeatureModules(["events", "faq"]);
    expect(result.events).toBe(false);
    expect(result.faq).toBe(false);
    expect(result.spaces).toBe(true);
    expect(result.reviews).toBe(true);
  });

  test("registry にない id は無視される（fail-closed: 余分な key は構築しない）", () => {
    const result = buildInitialFeatureModules(["unknown_module", "events"]);
    expect(result.events).toBe(false);
    // unknown_module は Record<FeatureModule, boolean> に含まれない
    expect(Object.keys(result).sort()).toEqual(
      [...FEATURE_MODULES_LIST].sort(),
    );
  });

  test("戻り値の key が FEATURE_MODULES_LIST と完全一致（drift 防止）", () => {
    const result = buildInitialFeatureModules();
    const resultKeys: string[] = Object.keys(result).sort();
    const registryKeys: string[] = [...FEATURE_MODULES_LIST].sort();
    expect(resultKeys).toEqual(registryKeys);
  });
});
