import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const adminRoot = path.join(workspaceRoot, "src", "app", "(admin)");
const publicRoot = path.join(workspaceRoot, "src", "app", "(public)");

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

/** そのソースが禁止 alias を import しているか（コメント行は数えない）。 */
export function importsForbiddenAlias(
  source: string,
  forbiddenAlias: "@/public" | "@/admin",
): boolean {
  const pattern = new RegExp(
    `from\\s+["']${forbiddenAlias.replace("/", "\\/")}(?:\\/|["'])`,
    "u",
  );
  return source.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
    return pattern.test(line);
  });
}

function collectCrossSurfaceImports(
  files: readonly string[],
  forbiddenAlias: "@/public" | "@/admin",
): string[] {
  return files.filter((file) =>
    importsForbiddenAlias(readFileSync(file, "utf8"), forbiddenAlias),
  );
}

describe("cross-surface import gate", () => {
  test("検出できる形・できない形（fixture）", () => {
    expect(
      importsForbiddenAlias('import { X } from "@/public/lib/x";', "@/public"),
    ).toBe(true);
    expect(
      importsForbiddenAlias('export { Y } from "@/admin/lib/y";', "@/admin"),
    ).toBe(true);
    // コメント内の言及は違反にしない。
    expect(
      importsForbiddenAlias('// from "@/public/lib/x" は禁止', "@/public"),
    ).toBe(false);
    expect(
      importsForbiddenAlias(' * from "@/admin/lib/y" を参照', "@/admin"),
    ).toBe(false);
    // 前方一致するだけの別 alias は拾わない。
    expect(
      importsForbiddenAlias('import { Z } from "@/publicity/z";', "@/public"),
    ).toBe(false);
    // 相手側の alias は各テストの対象外。
    expect(
      importsForbiddenAlias('import { W } from "@/shared/lib/w";', "@/public"),
    ).toBe(false);
  });

  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(collectSourceFiles(adminRoot).length).toBeGreaterThan(50);
    expect(collectSourceFiles(publicRoot).length).toBeGreaterThan(50);
  });

  test("(admin) は @/public を import しない", () => {
    const offenders = collectCrossSurfaceImports(
      collectSourceFiles(adminRoot),
      "@/public",
    );
    expect(offenders).toEqual([]);
  }, 30_000);

  test("(public) は @/admin を import しない", () => {
    const offenders = collectCrossSurfaceImports(
      collectSourceFiles(publicRoot),
      "@/admin",
    );
    expect(offenders).toEqual([]);
  });
});
