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
  return /import\s*{[^}]*\bget[A-Z]\w*[^}]*}\s*from\s*['"]@\/admin\/actions\//.test(
    source,
  );
}

function hasReadActionExport(source: string): boolean {
  return /export\s+async\s+function\s+get[A-Z]\w*/.test(source);
}

function hasConnectionOptIn(source: string): boolean {
  return (
    /import\s*{\s*connection\s*}\s*from\s*["']next\/server["']/.test(source) ||
    /await\s+connection\(\)/.test(source)
  );
}

describe("admin read boundaries", () => {
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

  test("admin app に connection() による dynamic opt-in を残さない", () => {
    const files = collectSourceFiles(adminRoot);
    const offenders = files.filter((file) =>
      hasConnectionOptIn(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

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
