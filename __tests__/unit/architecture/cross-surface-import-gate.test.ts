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

/**
 * 禁止 surface を指す綴りの一覧（監査 F-12）。
 *
 * 旧実装は `from "@/admin/…"` の 1 形だけを見ており、**同じ越境を 2 通りの書き方で
 * 素通り**させていた:
 *
 * - `await import("@/admin/lib/permissions")` — `from` を含まないので不一致
 * - `import … from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions"` —
 *   `@/*` alias（tsconfig の 4 本目）経由なので `@/admin` に一致しない
 *
 * どちらも public surface のモジュールグラフに admin 専用コードを引き込む。
 * `.claude/rules/src-boundaries.md` はこの gate を「相互 import 禁止の強制手段」と
 * 名指ししているので、規約は守られていると読まれ続けていた。
 */
function forbiddenSpecifierPrefixes(
  forbiddenAlias: "@/public" | "@/admin",
): readonly string[] {
  return forbiddenAlias === "@/admin"
    ? ["@/admin", "@/app/(admin)"]
    : ["@/public", "@/app/(public)"];
}

/** import / export / 動的 import / require の**どれでも**モジュール指定子を拾う。 */
const MODULE_SPECIFIER =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/gu;

/** そのソースが禁止 surface を import しているか（コメント行は数えない）。 */
export function importsForbiddenAlias(
  source: string,
  forbiddenAlias: "@/public" | "@/admin",
): boolean {
  const prefixes = forbiddenSpecifierPrefixes(forbiddenAlias);
  return source.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
    for (const match of line.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      // 前方一致するだけの別 alias（`@/publicity/…`）は拾わない。
      if (
        prefixes.some(
          (prefix) =>
            specifier === prefix || specifier.startsWith(`${prefix}/`),
        )
      ) {
        return true;
      }
    }
    return false;
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

    // --- 監査 F-12 で素通りしていた 2 形 ---
    // 動的 import（`from` を含まない）。
    expect(
      importsForbiddenAlias(
        'const { hasPermission } = await import("@/admin/lib/permissions");',
        "@/admin",
      ),
    ).toBe(true);
    expect(importsForbiddenAlias('require("@/public/lib/x")', "@/public")).toBe(
      true,
    );
    // `@/*` alias 経由の直書き（`@/admin` に一致しない綴り）。
    expect(
      importsForbiddenAlias(
        'import { ROLE_PERMISSIONS } from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions";',
        "@/admin",
      ),
    ).toBe(true);
    expect(
      importsForbiddenAlias(
        'const m = await import("@/app/(public)/_shared/lib/y");',
        "@/public",
      ),
    ).toBe(true);
    // 広げても、無関係な surface は拾わない。
    expect(
      importsForbiddenAlias(
        'import { Z } from "@/app/(public)/_shared/lib/z";',
        "@/admin",
      ),
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
