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
 *
 * ## 判定式の下限はマッチ件数
 *
 * 正しい側 (`error`) と非推奨側 (`message`) を 1 本で拾う。実ツリーは
 * `{ error: }` だけなので、matcher が空振りしても「違反 0 件」で緑になる。
 * 下限はマッチ件数（実測 645 matches / 107 files / 2327 scanned files）。
 * ファイル件数ではない。`message` 側は実例 0 件のため見本で固定する。
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** z.min(1, { error: }) と非推奨の { message: } を 1 本で拾う */
const ZOD_SCHEMA_ERROR_KEY =
  /\.(?:string|number|boolean|min|max|length|email|uuid|url|regex|datetime|int|positive|nonnegative|nonempty|gt|gte|lt|lte|startsWith|endsWith)\([^)]*\{\s*(?<key>message|error)\s*:/gu;

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

function schemaErrorKeys(sample: string): string[] {
  return [...sample.matchAll(ZOD_SCHEMA_ERROR_KEY)]
    .map((match) => match.groups?.["key"])
    .filter((key) => key !== undefined);
}

describe("Zod 4 schema style", () => {
  test("判定式は error と deprecated message の両方を拾う（見本）", () => {
    expect(schemaErrorKeys(`.min(1, { error: "必須" })`)).toEqual(["error"]);
    expect(schemaErrorKeys(`.min(1, { message: "必須" })`)).toEqual([
      "message",
    ]);
  });

  test("src 内の .ts / .tsx に z.*(..., { message: が含まれない", () => {
    const files = collectTsFiles(SRC);
    // 走査が 0 件に落ちると違反ゼロと区別が付かない。
    expect(files.length).toBeGreaterThan(100);

    let matchCount = 0;
    const hits: string[] = [];
    for (const fp of files) {
      const text = readFileSync(fp, "utf8");
      for (const match of text.matchAll(ZOD_SCHEMA_ERROR_KEY)) {
        matchCount += 1;
        if (match.groups?.["key"] === "message") {
          hits.push(fp);
        }
      }
    }
    // 下限はマッチ件数。実測 645。壊れた matcher が 0 件で緑にならないようにする。
    expect(matchCount).toBeGreaterThan(400);
    expect(hits).toEqual([]);
  });
});
