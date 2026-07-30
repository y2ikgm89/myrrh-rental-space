import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function readRepoFile(...segments: string[]): string {
  return readFileSync(join(ROOT, ...segments), "utf8");
}

describe("posts public URL clean break", () => {
  test("next.config.ts does not redirect legacy /posts URLs to /blog", () => {
    const source = readRepoFile("next.config.ts");

    expect(source).not.toContain('source: "/posts"');
    expect(source).not.toContain('source: "/posts/:path*"');
    expect(source).not.toMatch(/\/posts\s*(?:→|->)\s*\/blog/u);
  });

  test("system page bootstrap does not rename legacy posts pages", () => {
    const source = readRepoFile(
      "src",
      "shared",
      "domain",
      "pages",
      "system-pages-commands.ts",
    );

    expect(source).not.toContain("legacyPostsPage");
    expect(source).not.toContain('where: { slug: "posts" }');
  });

  test("legacy posts public path is not reserved or documented as a feature route", () => {
    const registry = readRepoFile(
      "src",
      "shared",
      "lib",
      "features",
      "registry.ts",
    );
    const slugValidation = readRepoFile(
      "src",
      "shared",
      "domain",
      "slugs",
      "validation.ts",
    );

    expect(registry).not.toContain("/posts");
    expect(slugValidation).not.toContain('"posts"');
    expect(slugValidation).not.toContain('"p"');
  });

  test("public app tree does not keep a legacy posts route folder", () => {
    expect(existsSync(join(ROOT, "src", "app", "(public)", "posts"))).toBe(
      false,
    );
  });

  test("visual regression artifacts use blog naming, not legacy posts naming", () => {
    const visualSpec = readRepoFile("e2e", "visual", "public-pages.spec.ts");
    const snapshotsDir = join(
      ROOT,
      "e2e",
      "visual",
      "public-pages.spec.ts-snapshots",
    );
    const snapshotNames = existsSync(snapshotsDir)
      ? readdirSync(snapshotsDir)
      : [];

    expect(visualSpec).toContain('"blog-list.png"');
    expect(visualSpec).not.toContain('"posts-list.png"');

    // baseline の**存在**は要求しない。baseline は CI の
    // workflow_dispatch(update_visual_baseline=true) が生成する成果物であり、
    // 再生成待ちの間は空になる（testing-e2e.md § visual regression）。
    // ここで固定したいのは「legacy な posts-* 命名が残っていないこと」。
    expect(
      snapshotNames.filter((name) => name.startsWith("posts-list")),
    ).toEqual([]);

    // canonical baseline は CI Ubuntu の *-linux.png のみ。
    // ローカル生成の *-win32.png を commit しない契約を機械強制する。
    expect(snapshotNames.filter((name) => name.includes("-win32."))).toEqual(
      [],
    );
  });
});
