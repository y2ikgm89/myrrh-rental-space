import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { resolveModuleSpecifier } from "../../helpers/architecture-fs";

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
 * 禁止 surface のルート（repo ルート相対・POSIX 区切り）。
 *
 * 判定は**綴りではなく解決後のパス**で行う。綴りを列挙する旧実装は、同じ越境を
 * 3 通りの書き方で素通りさせていた:
 *
 * - `await import("@/admin/lib/permissions")` — `from` を含まない（監査 F-12）
 * - `import ... from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions"` —
 *   `@/` alias 経由なので `@/admin` に前方一致しない（監査 F-12）
 * - `import ... from "../../../(admin)/admin/(dashboard)/_shared/lib/permissions"` —
 *   相対パスなのでどの alias 綴りにも一致しない（第6次監査 M-15）
 *
 * 綴りを 1 本ずつ足す方式では 4 通り目が必ず残る。`resolveModuleSpecifier` で
 * specifier を repo ルート相対パスへ解決し、この prefix と突き合わせる
 * （alias 表は tsconfig.json の paths と同じ longest-prefix 順で helper 側が持つ）。
 *
 * 直し方: 越境した import を消し、共有したい実装を `src/shared/` へ出す。
 * 背景は `.claude/rules/src-boundaries.md`。
 */
const SURFACE_ROOTS = {
  "@/admin": "src/app/(admin)/",
  "@/public": "src/app/(public)/",
} as const;

type ForbiddenSurface = keyof typeof SURFACE_ROOTS;

/** import / export / 動的 import / require の**どれでも**モジュール指定子を拾う。 */
const MODULE_SPECIFIER =
  /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/gu;

/**
 * そのソースが禁止 surface のモジュールを import しているか。
 * `fromRelPath` は相対 specifier を解決する基点（repo ルート相対・POSIX 区切り）。
 * コメント行は数えない。
 */
export function importsForbiddenSurface(
  fromRelPath: string,
  source: string,
  forbiddenSurface: ForbiddenSurface,
): boolean {
  const forbiddenRoot = SURFACE_ROOTS[forbiddenSurface];
  return source.split("\n").some((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
    for (const match of line.matchAll(MODULE_SPECIFIER)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      const resolved = resolveModuleSpecifier(fromRelPath, specifier);
      if (
        resolved.kind === "internal" &&
        resolved.relPath.startsWith(forbiddenRoot)
      ) {
        return true;
      }
    }
    return false;
  });
}

function toRelPosix(absPath: string): string {
  return path.relative(workspaceRoot, absPath).replaceAll("\\", "/");
}

function collectCrossSurfaceImports(
  files: readonly string[],
  forbiddenSurface: ForbiddenSurface,
): string[] {
  return files.filter((file) =>
    importsForbiddenSurface(
      toRelPosix(file),
      readFileSync(file, "utf8"),
      forbiddenSurface,
    ),
  );
}

describe("cross-surface import gate", () => {
  test("検出できる形・できない形（fixture）", () => {
    const PUBLIC_FILE = "src/app/(public)/_shared/lib/format-event-date.ts";
    const ADMIN_FILE =
      "src/app/(admin)/admin/(dashboard)/_shared/lib/permissions.ts";

    expect(
      importsForbiddenSurface(
        ADMIN_FILE,
        'import { X } from "@/public/lib/x";',
        "@/public",
      ),
    ).toBe(true);
    expect(
      importsForbiddenSurface(
        PUBLIC_FILE,
        'export { Y } from "@/admin/lib/y";',
        "@/admin",
      ),
    ).toBe(true);
    // コメント内の言及は違反にしない。
    expect(
      importsForbiddenSurface(
        ADMIN_FILE,
        '// from "@/public/lib/x" は禁止',
        "@/public",
      ),
    ).toBe(false);
    expect(
      importsForbiddenSurface(
        PUBLIC_FILE,
        ' * from "@/admin/lib/y" を参照',
        "@/admin",
      ),
    ).toBe(false);
    // 前方一致するだけの別 alias は拾わない（`@/publicity/z` → `src/publicity/z`）。
    expect(
      importsForbiddenSurface(
        ADMIN_FILE,
        'import { Z } from "@/publicity/z";',
        "@/public",
      ),
    ).toBe(false);
    // 相手側の alias は各テストの対象外。
    expect(
      importsForbiddenSurface(
        ADMIN_FILE,
        'import { W } from "@/shared/lib/w";',
        "@/public",
      ),
    ).toBe(false);

    // --- 監査 F-12 で素通りしていた 2 形 ---
    // 動的 import（`from` を含まない）。
    expect(
      importsForbiddenSurface(
        PUBLIC_FILE,
        'const { hasPermission } = await import("@/admin/lib/permissions");',
        "@/admin",
      ),
    ).toBe(true);
    expect(
      importsForbiddenSurface(
        ADMIN_FILE,
        'require("@/public/lib/x")',
        "@/public",
      ),
    ).toBe(true);
    // `@/` alias 経由の直書き。
    expect(
      importsForbiddenSurface(
        PUBLIC_FILE,
        'import { ROLE_PERMISSIONS } from "@/app/(admin)/admin/(dashboard)/_shared/lib/permissions";',
        "@/admin",
      ),
    ).toBe(true);
    expect(
      importsForbiddenSurface(
        ADMIN_FILE,
        'const m = await import("@/app/(public)/_shared/lib/y");',
        "@/public",
      ),
    ).toBe(true);
    // 広げても、無関係な surface は拾わない。
    expect(
      importsForbiddenSurface(
        PUBLIC_FILE,
        'import { Z } from "@/app/(public)/_shared/lib/z";',
        "@/admin",
      ),
    ).toBe(false);

    // --- 第6次監査 M-15: 3 通り目（相対パス綴り）---
    // 落ちるべき形: (public) から (admin) へ相対で抜ける。
    // → src/app/(admin)/admin/(dashboard)/_shared/lib/permissions
    expect(
      importsForbiddenSurface(
        PUBLIC_FILE,
        'import { ROLE_PERMISSIONS } from "../../../(admin)/admin/(dashboard)/_shared/lib/permissions";',
        "@/admin",
      ),
    ).toBe(true);
    // 落ちてはいけない形: 同じ `..` 記法でも surface 内に留まる。
    // → src/app/(public)/reservation/_components/guest-stepper
    expect(
      importsForbiddenSurface(
        PUBLIC_FILE,
        'import { GuestStepper } from "../../reservation/_components/guest-stepper";',
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
