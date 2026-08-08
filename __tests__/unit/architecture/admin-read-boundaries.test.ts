import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const adminRoot = path.join(workspaceRoot, "src", "app", "(admin)");

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!fullPath.endsWith(".ts") && !fullPath.endsWith(".tsx")) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function isActionReadImport(source: string): boolean {
  return /import\s*(?:type\s+)?{[^}]*\b(?:get|fetch)[A-Z]\w*[^}]*}\s*from\s*['"][^'"]*(?:@\/admin\/actions\/|_shared\/actions\/|\/actions\/)/.test(
    source,
  );
}

function hasReadActionExport(source: string): boolean {
  return /export\s+async\s+function\s+(?:get|fetch)[A-Z]\w*/.test(source);
}

describe("admin read boundaries", () => {
  test("走査根が生きている（消えると offenders が必ず空になる）", () => {
    // `collectSourceFiles` は存在しないディレクトリで空配列を返す。ルートが
    // rename / 移動されると offenders も必ず空になり、**緑が「違反なし」を
    // 意味しなくなる**。件数の下限をここで固定して、0 件と compliant を分ける。
    const actionRoot = path.join(
      adminRoot,
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
    );

    expect(collectSourceFiles(adminRoot).length).toBeGreaterThan(100);
    expect(collectSourceFiles(actionRoot).length).toBeGreaterThan(10);
  });

  test("admin app の server/client 実装に read 用 admin actions import を残さない", () => {
    const files = collectSourceFiles(adminRoot).filter((file) => {
      return !file.includes(`${path.sep}_shared${path.sep}actions${path.sep}`);
    });

    const offenders = files.filter((file) =>
      isActionReadImport(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  test("admin actions は mutation 専用にし、read 用 get* export を残さない", () => {
    const actionRoot = path.join(
      adminRoot,
      "admin",
      "(dashboard)",
      "_shared",
      "actions",
    );
    const files = collectSourceFiles(actionRoot);
    const offenders = files.filter((file) =>
      hasReadActionExport(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  // connection() は Suspense 内 async SC で必須のため、blanket-forbid はしない

  test("legacy /api/admin/media を削除し、canonical /admin/api/media のみ残す", () => {
    expect(
      existsSync(
        path.join(
          workspaceRoot,
          "src",
          "app",
          "api",
          "admin",
          "media",
          "route.ts",
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        path.join(
          workspaceRoot,
          "src",
          "app",
          "(admin)",
          "admin",
          "api",
          "media",
          "route.ts",
        ),
      ),
    ).toBe(true);
  });
});
