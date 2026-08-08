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

/**
 * 名前が書式に合わないディレクトリ。
 *
 * **判定は純粋関数として持つ。** 実ディレクトリを直接 filter していると、
 * migration を baseline へ畳んで 1 本になった瞬間に「見る対象が無い」状態と
 * 「違反が無い」状態が区別できなくなる。
 */
export function malformedDirNames(dirs: readonly string[]): string[] {
  return dirs.filter((name) => !DIR_NAME_PATTERN.test(name));
}

/**
 * 重複した 14 桁 timestamp を持つディレクトリの組。
 *
 * **ここが空振りしていた。** 前身は実ディレクトリを走査する for ループだけを
 * 持ち、`for (let i = 1; i < timestamps.length; i++)` は migration が 1 本に
 * 畳まれた時点で**本体を 1 度も実行しなくなった**。それでもテストは緑を返す
 * ——「比較して重複が無かった」と「比較する相手がいなかった」を区別できない。
 *
 * 判定を切り出して見本で固定する。実対象が 0 本でも、この関数が壊れれば落ちる。
 */
export function duplicateTimestamps(dirs: readonly string[]): string[] {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  for (const name of dirs) {
    const stamp = DIR_NAME_PATTERN.exec(name)?.[1];
    if (stamp === undefined) continue;
    const first = seen.get(stamp);
    if (first === undefined) {
      seen.set(stamp, name);
      continue;
    }
    duplicates.push(`${first} と ${name} が同じ ${stamp} を持つ`);
  }

  return duplicates;
}

describe("prisma migration directory structure", () => {
  test("判定が見本で正しく動く（自己検査）", () => {
    // fixture の 14 桁は**日付として成立しない**値を使う。実在しそうな
    // timestamp を書くと gates-do-not-pin-migrations が「migration の名指し」
    // として落とす（畳めば名前は嘘になるため）。
    // 1. 検出したい形が落ちる
    expect(
      duplicateTimestamps(["99999999999999_a", "99999999999999_b"]),
    ).toEqual([
      "99999999999999_a と 99999999999999_b が同じ 99999999999999 を持つ",
    ]);
    expect(malformedDirNames(["99999999999999_A_Bad"])).toEqual([
      "99999999999999_A_Bad",
    ]);

    // 2. 正当な形は通る
    expect(
      duplicateTimestamps(["99999999999999_a", "99999999999998_b"]),
    ).toEqual([]);
    expect(
      malformedDirNames(["00000000000000_init", "99999999999999_add_thing"]),
    ).toEqual([]);

    // 3. **1 本しか無くても判定は成立する**（前身はここで空振りしていた）
    expect(duplicateTimestamps(["00000000000000_init"])).toEqual([]);
    expect(duplicateTimestamps([])).toEqual([]);
  });

  test("每 migration ディレクトリ名は <14-digit-timestamp>_<snake-case> 書式", () => {
    expect(malformedDirNames(listMigrationDirs())).toEqual([]);
  });

  test("14-digit timestamp が重複していない（壁時計の厳密な単調増加は検証しない）", () => {
    expect(duplicateTimestamps(listMigrationDirs())).toEqual([]);
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
