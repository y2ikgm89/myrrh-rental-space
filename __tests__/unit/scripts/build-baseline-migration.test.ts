/**
 * `scripts/build-baseline-migration.ts` の検査ロジック。
 *
 * 一番防ぎたいのは「**空の baseline を成功として書き出す**」こと。
 * `prisma migrate diff` は datasource を解決できないときでも exit 0 のまま空の
 * `--script` を返すことがあり、そのまま書けば「適用しても何も起きない migration」が
 * 出来上がる。しかも `prisma migrate deploy` は成功する。
 *
 * 件数の期待値は schema.prisma から数える。固定値で持つと schema が育った瞬間に
 * drift して、以後ずっと嘘の検査になる。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assembleBaseline,
  countDeclarations,
  countDataStatements,
  countGeneratedObjects,
  verifyGeneratedSql,
} from "../../../scripts/build-baseline-migration";

const SCHEMA = readFileSync(
  join(process.cwd(), "prisma", "schema.prisma"),
  "utf8",
);

function generatedFor(models: number, enums: number): string {
  const lines: string[] = [];
  for (let i = 0; i < enums; i += 1)
    lines.push(`CREATE TYPE "E${i}" AS ENUM ('A');`);
  for (let i = 0; i < models; i += 1)
    lines.push(`CREATE TABLE "t${i}" (id text);`);
  return lines.join("\n");
}

describe("countDeclarations", () => {
  test("実物の schema.prisma から model と enum を数えられる", () => {
    const counts = countDeclarations(SCHEMA);
    expect(counts.models).toBeGreaterThan(50);
    expect(counts.enums).toBeGreaterThan(30);
  });

  test("行頭以外の model / enum は数えない（コメントや説明文を拾わない）", () => {
    const source = [
      "/// この model は enum を持つ",
      "model A {",
      "  id String @id",
      "}",
      "enum B {",
      "  X",
      "}",
    ].join("\n");
    expect(countDeclarations(source)).toEqual({ models: 1, enums: 1 });
  });
});

describe("countGeneratedObjects", () => {
  test("行頭の CREATE TABLE / CREATE TYPE だけを数える", () => {
    const sql = [
      "CREATE TYPE \"Role\" AS ENUM ('A');",
      "-- CREATE TABLE this is a comment",
      'CREATE TABLE "users" (id text);',
      '  CREATE TABLE "indented" (id text);',
    ].join("\n");
    expect(countGeneratedObjects(sql)).toEqual({ tables: 1, types: 1 });
  });
});

describe("verifyGeneratedSql", () => {
  const schema = "model A {\n}\nmodel B {\n}\nenum C {\n}\n";

  test("件数が一致すれば問題なし", () => {
    expect(verifyGeneratedSql(generatedFor(2, 1), schema)).toEqual([]);
  });

  test("空出力を必ず拒否する（datasource 未解決でも exit 0 で返ってくる経路）", () => {
    const problems = verifyGeneratedSql("", schema);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problem).toContain("空");
  });

  test("空白だけの出力も拒否する", () => {
    expect(verifyGeneratedSql("   \n\n  ", schema)).toHaveLength(1);
  });

  test("テーブルが 1 つ足りなければ検出する", () => {
    const problems = verifyGeneratedSql(generatedFor(1, 1), schema);
    expect(problems.map((p) => p.problem).join(" ")).toContain(
      "CREATE TABLE 数",
    );
  });

  test("enum が 1 つ足りなければ検出する", () => {
    const problems = verifyGeneratedSql(generatedFor(2, 0), schema);
    expect(problems.map((p) => p.problem).join(" ")).toContain(
      "CREATE TYPE 数",
    );
  });

  test("テーブルが多すぎる場合も検出する（一致であって下限ではない）", () => {
    const problems = verifyGeneratedSql(generatedFor(3, 1), schema);
    expect(problems.map((p) => p.problem).join(" ")).toContain(
      "CREATE TABLE 数",
    );
  });

  test("schema が読めていなければ検出する（DDL は出ているのに宣言 0 件のケース）", () => {
    // 空 SQL は先に「出力が空」で弾かれるので、DDL は非空にしておく。
    const problems = verifyGeneratedSql(generatedFor(1, 1), "");
    expect(problems.map((p) => p.problem).join(" ")).toContain(
      "宣言が読めていない",
    );
  });
});

describe("countDataStatements", () => {
  test("baseline はデータ投入文を持たない（初期データは seed が持つ）", () => {
    const init = readFileSync(
      join(
        process.cwd(),
        "prisma",
        "migrations",
        "00000000000000_init",
        "migration.sql",
      ),
      "utf8",
    );

    // かつて baseline には 8 本の terms_documents INSERT（法的文書）が埋まっており、
    // seed.ts はそれらに一切触らなかった。畳めば消える形だったので seed へ移した。
    // **ここが 0 でなくなったら、また「migration にしか無いデータ」が生まれている。**
    // その状態で次に畳むと静かに消える（builder のガードが止めるが、そもそも作らない）。
    expect(countDataStatements(init)).toBe(0);
  });

  test("組み立てた baseline はデータ投入文を持たない", () => {
    expect(
      countDataStatements(assembleBaseline("a;", "CREATE TABLE t();", "c;")),
    ).toBe(0);
  });

  test("大文字小文字と行頭空白を問わず数える", () => {
    const sql = [
      "INSERT INTO a VALUES (1);",
      "  insert into b values (2);",
      "-- INSERT INTO c -- コメントは数えない対象ではないが行頭一致しない",
      "SELECT 1;",
    ].join("\n");
    expect(countDataStatements(sql)).toBe(2);
  });
});

describe("assembleBaseline", () => {
  test("prelude → 生成 DDL → postlude の順で並べる", () => {
    const out = assembleBaseline(
      "CREATE EXTENSION pg_trgm;",
      "CREATE TABLE t (id text);",
      "ALTER TABLE t ADD CONSTRAINT c CHECK (true);",
    );
    const extension = out.indexOf("CREATE EXTENSION");
    const table = out.indexOf("CREATE TABLE");
    const check = out.indexOf("ADD CONSTRAINT");

    expect(extension).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(extension);
    expect(check).toBeGreaterThan(table);
  });

  test("手編集しないことを冒頭に明示する", () => {
    expect(assembleBaseline("a;", "b;", "c;")).toContain("手で編集しない");
  });
});
