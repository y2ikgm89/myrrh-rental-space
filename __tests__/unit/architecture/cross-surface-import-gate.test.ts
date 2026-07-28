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

function collectCrossSurfaceImports(
  files: readonly string[],
  forbiddenAlias: "@/public" | "@/admin",
): string[] {
  const pattern = new RegExp(
    `from\\s+["']${forbiddenAlias.replace("/", "\\/")}(?:\\/|["'])`,
    "u",
  );
  return files.filter((file) => {
    const source = readFileSync(file, "utf8");
    return source.split("\n").some((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
      return pattern.test(line);
    });
  });
}

describe("cross-surface import gate", () => {
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
