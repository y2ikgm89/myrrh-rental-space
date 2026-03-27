/**
 * Zod 4: スキーマ引数で非推奨の `message:` が src に残っていないことを検証する。
 * プロジェクトルールは `{ error: "..." }` 形式（.claude/rules/zod-patterns.md）。
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** z.min(1, { message: }) のようなパターン（error: に統一すべき） */
const ZOD_DEPRECATED_MESSAGE_ARG =
  /\.(?:min|max|length|email|uuid)\([^)]*\{\s*message\s*:/;

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      out.push(...collectTsFiles(p));
    } else if (ent.isFile() && ent.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("Zod 4 schema style", () => {
  test("src 内の .ts に z.*(..., { message: が含まれない", () => {
    const files = collectTsFiles(SRC);
    const hits: string[] = [];
    for (const fp of files) {
      const text = readFileSync(fp, "utf8");
      if (ZOD_DEPRECATED_MESSAGE_ARG.test(text)) {
        hits.push(fp);
      }
    }
    expect(hits).toEqual([]);
  });
});
