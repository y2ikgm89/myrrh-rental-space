/**
 * Zod 4: スキーマ引数で非推奨の `message:` が src に残っていないことを検証する。
 * error メッセージは `{ error: "..." }` 形式を使う。
 *
 * ## 走査の穴を 2 つ塞いである
 *
 * - **`.tsx` を見ていなかった。** 収集が `.ts` だけだったため、`src` の `.tsx` に
 *   書かれた Zod（実測 7 ファイル）は構造的に対象外だった。現時点で違反は無いが、
 *   「今は無い」と「見ている」は別で、次に `.tsx` へ書かれたら黙って通る
 * - **走査根が消えると空振りしていた。** `existsSync` で早期 return していたので、
 *   `src` の移動・改名で収集 0 件 → `expect(hits).toEqual([])` が素通りする。
 *   落ちる側へ倒し、収集件数の下限も置く
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** z.min(1, { message: }) のようなパターン（error: に統一すべき） */
const ZOD_DEPRECATED_MESSAGE_ARG =
  /\.(?:string|number|boolean|min|max|length|email|uuid|url|regex|datetime|int|positive|nonnegative|nonempty|gt|gte|lt|lte|startsWith|endsWith)\([^)]*\{\s*message\s*:/;

/**
 * `.ts` と `.tsx` を集める。走査根が無ければ **throw する**（早期 return しない）。
 * 消えた根を握り潰すと、以降の assertion が空集合に対して緑を返す。
 */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      out.push(...collectTsFiles(p));
    } else if (
      ent.isFile() &&
      (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx"))
    ) {
      out.push(p);
    }
  }
  return out;
}

describe("Zod 4 schema style", () => {
  test("src 内の .ts / .tsx に z.*(..., { message: が含まれない", () => {
    const files = collectTsFiles(SRC);
    // 走査が 0 件に落ちると違反ゼロと区別が付かない。
    expect(files.length).toBeGreaterThan(100);

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
