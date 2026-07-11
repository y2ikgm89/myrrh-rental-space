/**
 * architecture テスト用の再帰ファイル収集ヘルパー。
 *
 * `architecture-boundaries.test.ts` から抜き出し、split 後の後続 test
 * (`section-config-widening-cast.test.ts` / `type-safety-cast-drift.test.ts` /
 * `next-config-cache-tag-emission.test.ts` etc.) が同じロジックを共有する。
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

/** TS / TSX を再帰収集 (architecture gate の横断 grep 用) */
export function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }

  return files;
}
