import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();
const publicAppRoot = path.join(workspaceRoot, "src", "app", "(public)");

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

describe("public path alias hygiene", () => {
  test("src/app/(public) の _shared import は @/public alias を使う", () => {
    const offenders = collectSourceFiles(publicAppRoot).filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.split("\n").some((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
        return /from\s+["']@\/app\/\(public\)\/_shared\//.test(line);
      });
    });

    expect(offenders).toEqual([]);
  }, 30_000);
});
