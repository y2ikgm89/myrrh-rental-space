import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function filePath(path: string): string {
  return join(root, ...path.split("/"));
}

function read(path: string): string {
  return readFileSync(filePath(path), "utf8");
}

describe("admin clean-break dead code boundaries", () => {
  test("admin integration tests must not re-declare schemas inline with z.object", () => {
    // shallow zombie test (production schema を import せず inline 再宣言して
    // safeParse のみ走らせるテスト) は永続化層 0 カバレッジで本物のドリフトを
    // 検知できないため禁止。Server Action を本物呼び出しする integration test、
    // または production schema を import する unit test に置き換えること。
    const dir = filePath("__tests__/integration/actions/admin");
    if (!existsSync(dir)) return;

    const offenders: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".test.ts")) continue;
      const source = readFileSync(join(dir, entry), "utf8");
      if (/\bz\.object\s*\(/.test(source)) {
        offenders.push(entry);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("content managed page editor does not keep builder inserter, legacy section editor, or page-hero editor", () => {
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionInserter.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditor.tsx",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageHeroEditor.tsx",
        ),
      ),
    ).toBe(false);
  });

  test("settings dialog definitions do not keep unused width contracts", () => {
    const typesSource = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/types.ts",
    );
    const postSettings = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/post.tsx",
    );
    const newsSettings = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/news.tsx",
    );

    expect(typesSource).not.toContain("width:");
    expect(postSettings).not.toContain('width: "default"');
    expect(newsSettings).not.toContain('width: "default"');
  });

  test("shared utils compatibility re-export is removed", () => {
    expect(existsSync(filePath("src/shared/lib/utils.ts"))).toBe(false);

    const utilsTest = read("__tests__/unit/lib/utils.test.ts");
    expect(utilsTest).not.toContain("@/shared/lib/utils");
    expect(utilsTest).toContain("@/shared/lib/form-data");
    expect(utilsTest).toContain("@/shared/lib/slug");
  });

  test("shared logger compatibility re-export is removed", () => {
    expect(existsSync(filePath("src/shared/lib/logger.ts"))).toBe(false);

    for (const path of [
      "src/app/sitemap.ts",
      "src/shared/lib/cloudflare.ts",
      "__tests__/unit/lib/logger.test.ts",
    ]) {
      const source = read(path);
      expect(source).not.toContain("@/shared/lib/logger");
      expect(source).toContain("logger-core");
    }
  });

  test("admin password login validation and pages are removed", () => {
    expect(
      existsSync(
        filePath(
          "src/app/(admin)/admin/(dashboard)/_shared/lib/validations/auth.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(filePath("src/app/(admin)/admin/(auth)/login/page.tsx")),
    ).toBe(false);
    expect(
      existsSync(
        filePath("src/app/(admin)/admin/(auth)/forgot-password/page.tsx"),
      ),
    ).toBe(false);
    expect(
      existsSync(
        filePath("src/app/(admin)/admin/(auth)/reset-password/page.tsx"),
      ),
    ).toBe(false);
  });
});
