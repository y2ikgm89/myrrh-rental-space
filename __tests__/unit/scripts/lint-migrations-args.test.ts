/**
 * `scripts/lint-migrations.ts` の引数仕分け。
 *
 * migration 履歴を 1 本の baseline へ畳む PR は **99 本の migration.sql を削除して
 * 1 本を追加する**。CI の paths-filter は既定の change type が deleted も含むため、
 * 対策しないと実体の無いパスが squawk に渡って migration-safety job が落ちる
 * （deploy 側には `[ -f ] || continue` のガードが元からあるが CI 側には無かった）。
 *
 * ここで固定するのは「削除済みは飛ばす」だけではない。**全件が実体無しなら
 * 非ゼロで終える**ことも固定する。0 件 lint を緑で返すと、typo したパスが
 * そのまま通過してしまうため。
 */

import { describe, test, expect } from "bun:test";
import { partitionMigrationArgs } from "../../../scripts/lint-migrations";

/** 実ファイルに触らないための注入。第 2 引数が既定 existsSync の差し替え口。 */
function existsIn(paths: readonly string[]): (path: string) => boolean {
  return (path) => paths.includes(path);
}

// timestamp 形の名前は使わない（実在しない migration を名指ししていると
// `gates-do-not-pin-migrations.test.ts` が区別できないため。同 gate の docblock 参照）。
const A = "prisma/migrations/fixture_a/migration.sql";
const B = "prisma/migrations/fixture_b/migration.sql";

describe("partitionMigrationArgs", () => {
  test("実在するものだけを lint 対象にする", () => {
    const result = partitionMigrationArgs([A, B], existsIn([A]));
    expect(result.present).toEqual([A]);
    expect(result.missing).toEqual([B]);
  });

  test("履歴を畳む形（大量削除 + 1 本追加）で追加分だけが残る", () => {
    const deleted = Array.from(
      { length: 99 },
      (_, i) => `prisma/migrations/2026010${i % 10}00000_old${i}/migration.sql`,
    );
    const added = "prisma/migrations/00000000000000_init/migration.sql";
    const result = partitionMigrationArgs(
      [...deleted, added],
      existsIn([added]),
    );
    expect(result.present).toEqual([added]);
    expect(result.missing).toHaveLength(99);
  });

  test("migration SQL でない引数は別枠に分ける", () => {
    const result = partitionMigrationArgs(
      [A, "prisma/schema.prisma", "README.md"],
      existsIn([A]),
    );
    expect(result.present).toEqual([A]);
    expect(result.missing).toEqual([]);
    expect(result.notMigrations).toEqual(["prisma/schema.prisma", "README.md"]);
  });

  test("全件が実体無しでも present と missing を区別して返す（呼び出し側が非ゼロにできる）", () => {
    const result = partitionMigrationArgs([A, B], existsIn([]));
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual([A, B]);
  });

  test("引数なしは全て空", () => {
    const result = partitionMigrationArgs([], existsIn([]));
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.notMigrations).toEqual([]);
  });

  test("--selftest フラグは migration SQL 扱いしない", () => {
    const result = partitionMigrationArgs(["--selftest"], existsIn([]));
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.notMigrations).toEqual(["--selftest"]);
  });
});
