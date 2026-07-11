/**
 * Prisma は `prisma/migrations/` を **ディレクトリ名の文字列比較順** に適用する。
 * ディレクトリ名は `<14-digit-timestamp>_<snake-case-name>` の形式で、Prisma 自身は
 * timestamp 部分の妥当性 / 単調増加を検証しない。手書きで migration ディレクトリを
 * 作った際に、既存の最大 timestamp より前の値を付けてしまうと:
 *
 * - shadow DB 上での順序は文字列比較で保たれるので、shadow build は通る
 * - 本番 DB は既に「後から追加された過去 timestamp の migration」を未適用として認識する
 * - `prisma migrate deploy` が「既に applied な後発 migration の前」に新規 migration を
 *   挿入しようとし、`_prisma_migrations` テーブルの整合性が壊れる
 *
 * この silent regression を PR level で塞ぐため、本 gate は:
 *
 * 1. `<14-digit>_<snake-case>` の書式を強制する（`00000000000000_init` を含む）
 * 2. 隣接する 2 つの timestamp が strictly increasing であることを検証する
 *
 * `prisma/migrations/migration_lock.toml` はディレクトリではないので除外する。
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

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

  test("timestamp は strictly monotonic increasing (silent shadow-DB drift 防止)", () => {
    const dirs = listMigrationDirs();
    const timestamps = dirs.map((name) => {
      const match = DIR_NAME_PATTERN.exec(name);
      expect(match).not.toBeNull();
      return match![1]!;
    });

    for (let i = 1; i < timestamps.length; i++) {
      const previous = timestamps[i - 1]!;
      const current = timestamps[i]!;
      expect(
        current > previous,
        `migration timestamp regression at ${dirs[i]}: ${current} is not > ${previous} (${dirs[i - 1]})`,
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
