/**
 * `run()` が**確かめられなかったものを通さない**ことの検査。
 *
 * ## なぜ静的 gate では足りないのか
 *
 * この道具の価値は終了コードだけにある。「確かめた」と言いながら 0 を返す経路が
 * 1 本でもあれば、それは道具が無いより悪い（あると思って見なくなるから）。
 * 経路は実 DB の状態で決まるので、実 DB でしか固定できない。
 *
 * ここで押さえる 4 経路:
 *
 * | 状態 | 期待 |
 * | --- | --- |
 * | 列を足してから制約を付ける migration・既定値が制約に違反 | 1（制約名と行数を出す） |
 * | 同上・既定値が制約を満たす | 0（空振りの警報にしない） |
 * | プローブが実行できない | 1（かつて SKIP で握り潰していた） |
 * | テーブルはあるのに migration 履歴が無い | 1（かつて「空の DB」と読んで全部免除していた） |
 *
 * 3 番目は PR #1956 のレビュー指摘そのもの。4 番目は baseline を migrate 済み DB へ
 * 当てたときの状態で、`.claude/rules/migrations.md` が「Prisma は止めてくれない」と
 * 書いている場面にあたる。
 *
 * == 実行条件 ==
 * `bun run test:integration`（test-db を自動起動 + migrate deploy）。
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

import { run } from "../../../scripts/migration-preconditions";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);

const TABLE = "precondition_failclosed_target";
const SCRATCH_DB = "myrrh_precondition_nohistory";

let prisma: PrismaClient;
let workDir: string;

/** 使い捨ての migration ディレクトリを作って、その path を返す。 */
function migrationDir(name: string, sql: string): string {
  const root = mkdtempSync(join(workDir, "mig-"));
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "migration.sql"), sql, "utf8");
  return root;
}

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "precondition-"));
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLE}"`);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${TABLE}" ("id" text PRIMARY KEY)`,
  );
  await prisma.$executeRawUnsafe(`INSERT INTO "${TABLE}" VALUES ('a'), ('b')`);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLE}"`);
  await prisma.$disconnect();
  rmSync(workDir, { recursive: true, force: true });
});

describe("適用前チェックは確かめられなかったものを通さない", () => {
  test("同じ migration が足す列の既定値が制約に違反する → 1", async () => {
    // 既存行はこの列を持たないので、素朴に書くとプローブが「列が無い」で落ちる。
    // 既定値を合成して評価するので、実際に落ちることを事前に言える。
    const dir = migrationDir(
      "20260806000000_add_and_constrain",
      `BEGIN;
ALTER TABLE "${TABLE}" ADD COLUMN "score" integer NOT NULL DEFAULT -1;
ALTER TABLE "${TABLE}" ADD CONSTRAINT "${TABLE}_score_check" CHECK ("score" >= 0);
COMMIT;
`,
    );

    expect(await run(["--url", url, "--migrations", dir])).toBe(1);
  });

  test("同じ列の既定値が制約を満たす → 0（空振りの警報にしない）", async () => {
    const dir = migrationDir(
      "20260806000000_add_and_constrain",
      `BEGIN;
ALTER TABLE "${TABLE}" ADD COLUMN "score" integer NOT NULL DEFAULT 0;
ALTER TABLE "${TABLE}" ADD CONSTRAINT "${TABLE}_score_check" CHECK ("score" >= 0);
COMMIT;
`,
    );

    expect(await run(["--url", url, "--migrations", dir])).toBe(0);
  });

  test("1 文で列を足してその列を制約する → 通る migration は止めない", async () => {
    // Prisma が出す形。後続アクションが前のアクションの列を見ないと
    // 「列が無い」でプローブが落ち、通る migration を未評価として止めてしまう。
    const ok = migrationDir(
      "20260806000000_same_statement",
      `ALTER TABLE "${TABLE}" ADD COLUMN "score" integer NOT NULL DEFAULT 0, ADD CONSTRAINT "${TABLE}_score_check" CHECK ("score" >= 0);
`,
    );
    expect(await run(["--url", url, "--migrations", ok])).toBe(0);

    // 同じ形で既定値が違反するなら、当然 1。
    const bad = migrationDir(
      "20260806000000_same_statement",
      `ALTER TABLE "${TABLE}" ADD COLUMN "score" integer NOT NULL DEFAULT -1, ADD CONSTRAINT "${TABLE}_score_check" CHECK ("score" >= 0);
`,
    );
    expect(await run(["--url", url, "--migrations", bad])).toBe(1);
  });

  test("プローブが実行できない → 1", async () => {
    // 存在しない列を参照する CHECK。かつてはここが SKIP のログだけ出して
    // exit 0 になり、`migrate deploy` へ進んでいた。
    const dir = migrationDir(
      "20260806000000_unrunnable",
      `ALTER TABLE "${TABLE}" ADD CONSTRAINT "${TABLE}_ghost_check" CHECK ("no_such_column" > 0);
`,
    );

    expect(await run(["--url", url, "--migrations", dir])).toBe(1);
  });

  test("分類できない文が残っていれば 1", async () => {
    // `VALIDATE CONSTRAINT` は `NOT VALID` で足した制約を全行走査する文。
    // かつては SAFE_STATEMENT が通していた。
    const dir = migrationDir(
      "20260806000000_unknown",
      `ALTER TABLE "${TABLE}" VALIDATE CONSTRAINT "${TABLE}_some_check";
`,
    );

    expect(await run(["--url", url, "--migrations", dir])).toBe(1);
  });

  describe("履歴と実スキーマの食い違い", () => {
    let scratchUrl: string;

    beforeAll(async () => {
      // CREATE DATABASE はトランザクション内で走らせられないので直接流す。
      const admin = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: url.replace(/\/[^/?]+(\?|$)/u, "/postgres$1"),
        }),
      });
      try {
        await admin.$executeRawUnsafe(
          `DROP DATABASE IF EXISTS "${SCRATCH_DB}"`,
        );
        await admin.$executeRawUnsafe(`CREATE DATABASE "${SCRATCH_DB}"`);
      } finally {
        await admin.$disconnect();
      }
      scratchUrl = url.replace(/\/[^/?]+(\?|$)/u, `/${SCRATCH_DB}$1`);
      const scratch = new PrismaClient({
        adapter: new PrismaPg({ connectionString: scratchUrl }),
      });
      try {
        // 履歴は作らず、baseline が作るはずのテーブルだけ置く。
        await scratch.$executeRawUnsafe(`CREATE TABLE "spaces" ("id" text)`);
      } finally {
        await scratch.$disconnect();
      }
    });

    afterAll(async () => {
      const admin = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: url.replace(/\/[^/?]+(\?|$)/u, "/postgres$1"),
        }),
      });
      try {
        await admin.$executeRawUnsafe(
          `DROP DATABASE IF EXISTS "${SCRATCH_DB}"`,
        );
      } finally {
        await admin.$disconnect();
      }
    });

    test("テーブルはあるのに migration 履歴が無い → 1", async () => {
      // かつてはここを「空の DB」と読み、baseline の CREATE TABLE を
      // 「これから作る＝既存行なし」と見なして検査対象が 0 件になり、
      // 何も確かめずに 0 を返していた。
      expect(await run(["--url", scratchUrl])).toBe(1);
    });
  });

  afterEach(async () => {
    // 各テストは実際には DDL を適用しないが、取りこぼしがあれば次に響く。
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${TABLE}" DROP COLUMN IF EXISTS "score"`,
    );
  });
});
