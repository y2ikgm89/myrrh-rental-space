/**
 * STATIC_PAGES drift gate.
 *
 * sitemap.ts の `STATIC_PAGES` は SYSTEM_PAGES と FEATURE_MODULES.publicRoutes に
 * 暗黙依存する：path は SYSTEM_PAGE_SLUGS の subset でなければならず、feature
 * gate される entry は対応する module の publicRoutes に列挙されている必要がある。
 *
 * これらの SSoT が drift すると sitemap が黙って壊れる（404 ルートを emit / OFF した
 * feature の URL が出続ける）ため、構造関係をテストで強制する。
 */

import { describe, expect, test } from "bun:test";
import { STATIC_PAGES } from "@/app/sitemap";
import { SYSTEM_PAGE_SLUGS } from "@/shared/lib/validations/page";
import { FEATURE_MODULES } from "@/shared/lib/features/registry";

/** feature module で OFF できない常時 emit ルート（home / about / 法的 terms）。 */
const ALWAYS_ON_PATHS = new Set(["/", "/about", "/terms"]);

describe("STATIC_PAGES drift gate", () => {
  test("path と slug は home 以外で `/${slug}` の関係を満たす", () => {
    for (const { path, slug } of STATIC_PAGES) {
      if (slug === "home") {
        expect(path).toBe("/");
        continue;
      }
      expect(path).toBe(`/${slug}`);
    }
  });

  test("各 slug は SYSTEM_PAGE_SLUGS の subset である", () => {
    for (const { slug } of STATIC_PAGES) {
      expect(SYSTEM_PAGE_SLUGS).toContain(slug);
    }
  });

  test("常時 emit ルート以外は exactly 1 module の publicRoutes に出現する", () => {
    for (const { path } of STATIC_PAGES) {
      if (ALWAYS_ON_PATHS.has(path)) continue;
      const owners = Object.values(FEATURE_MODULES).filter((m) =>
        m.publicRoutes.includes(path),
      );
      expect(owners).toHaveLength(1);
    }
  });

  test("常時 emit ルートは feature module の publicRoutes に出現しない", () => {
    for (const path of ALWAYS_ON_PATHS) {
      const owners = Object.values(FEATURE_MODULES).filter((m) =>
        m.publicRoutes.includes(path),
      );
      expect(owners).toHaveLength(0);
    }
  });

  test("STATIC_PAGES に重複 path / slug が無い", () => {
    const paths = STATIC_PAGES.map((p) => p.path);
    const slugs = STATIC_PAGES.map((p) => p.slug);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
