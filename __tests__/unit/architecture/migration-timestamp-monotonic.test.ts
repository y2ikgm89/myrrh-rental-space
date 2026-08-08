/**
 * Prisma は `prisma/migrations/` を **ディレクトリ名の文字列比較順** に適用する。
 * ディレクトリ名は `<14-digit-timestamp>_<snake-case-name>` の形式で、Prisma 自身は
 * timestamp 部分の妥当性を検証しない。
 *
 * ## この gate が本当に検出できるもの
 *
 * `readdirSync` の結果を `.sort()` した**後**に隣接ペアを比較している。つまり比較対象は
 * 常に「文字列としてすでに昇順」の列で、14 桁の timestamp は固定長数字なので文字列順と
 * 数値順が一致する。この条件下で `current > previous`（厳密な不等号）が成立しないのは
 * **timestamp が完全に重複しているとき（`current === previous`）だけ**で、それ以外の
 * 並びでは重複が無い限り必ず成立する。
 *
 * つまりこの gate が検証しているのは**「同じ 14 桁 timestamp を持つ migration ディレクトリが
 * 無い」ことだけ**であって、「壁時計上の作成順に厳密に増加している」ことではない。
 * 2 人が同じ日時をコピーして別名の migration を作った場合や、CI の同時実行で同じ秒に
 * 生成された場合の**重複**を捕まえるのがこの gate の役割。
 *
 * ## この gate が検出できないもの
 *
 * 既存の最大 timestamp より前の**重複しない**値を手書きで付けた場合（例:
 * 昨日の日時を書き間違える）は、ディレクトリ名としては一意なので上記の隣接比較を
 * 素通りする。その場合に本当に起きること（shadow DB 上の適用順と本番の未適用判定の
 * 食い違い）は `prisma migrate deploy` 自体の挙動に依存し、本 gate の範囲外。
 *
 * この gate は次を強制する:
 *
 * 1. `<14-digit>_<snake-case>` の書式（`00000000000000_init` を含む）
 * 2. 隣接する 2 つの timestamp が重複していない
 *
 * `prisma/migrations/migration_lock.toml` はディレクトリではないので除外する。
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { definite } from "../../support/definite";

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");
const DIR_NAME_PATTERN = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)$/u;

function listMigrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      const path = join(MIGRATIONS_DIR, name);
      try {
        return statSync(path).isDirectory();
      } catch {
        return false;
      }
    })
    .sort(); // string sort matches Prisma's apply order
}

describe("prisma migration directory structure", () => {
  test("每 migration ディレクトリ名は <14-digit-timestamp>_<snake-case> 書式", () => {
    const dirs = listMigrationDirs();
    const offenders = dirs.filter((name) => !DIR_NAME_PATTERN.test(name));
    expect(offenders).toEqual([]);
  });

  test("14-digit timestamp が重複していない（壁時計の厳密な単調増加は検証しない）", () => {
    const dirs = listMigrationDirs();
    const timestamps = dirs.map((name) => {
      const match = DIR_NAME_PATTERN.exec(name);
      expect(match).not.toBeNull();
      return definite(
        definite(match, "timestamp の一致")[1],
        "timestamp の 1 群",
      );
    });

    // 一覧はすでに文字列順（= 14 桁固定長なので数値順と一致）にソート済み。
    // ここで検出できるのは隣接 2 件の timestamp が完全一致する「重複」だけ。
    for (let i = 1; i < timestamps.length; i++) {
      const previous = definite(timestamps[i - 1], `timestamps[${i - 1}]`);
      const current = definite(timestamps[i], `timestamps[${i}]`);
      expect(
        current > previous,
        `重複した migration timestamp: ${dirs[i]} と ${dirs[i - 1]} が同じ ${current} を持つ`,
      ).toBe(true);
    }
  });

  test("各 migration ディレクトリに migration.sql が存在する", () => {
    const dirs = listMigrationDirs();
    const missing = dirs.filter((name) => {
      const sqlPath = join(MIGRATIONS_DIR, name, "migration.sql");
      try {
        return !statSync(sqlPath).isFile();
      } catch {
        return true;
      }
    });
    expect(missing).toEqual([]);
  });

  test("baseline init migration is 00000000000000_init", () => {
    const dirs = listMigrationDirs();
    expect(dirs[0]).toBe("00000000000000_init");
  });
});
