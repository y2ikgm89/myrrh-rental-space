import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function filePath(path: string): string {
  return join(root, ...path.split("/"));
}

function read(path: string): string {
  return readFileSync(filePath(path), "utf8");
}

describe("admin clean-break dead code boundaries", () => {
  test("settings-other integration tests import the production sidebar schema", () => {
    const testSource = read(
      "__tests__/integration/actions/admin/settings-other.test.ts",
    );

    expect(testSource).toContain('from "@/shared/lib/validations/sidebar"');
    expect(testSource).not.toContain("const sidebarWidgetsSchema = z.object");
    expect(testSource).not.toContain("const sidebarSettingsSchema = z.object");
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
});
