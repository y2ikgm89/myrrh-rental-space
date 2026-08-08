/**
 * 適用前チェックが**実 DB で正しい終了コードを返す**ことの検査。
 *
 * ## ここが唯一の証明になる
 *
 * この道具は未適用 migration を実際に流して巻き戻す。判定は PostgreSQL の
 * 実挙動そのものなので、静的な gate では何も証明できない。だから
 *
 *   - 落ちる migration → 1（失敗した文と本当のエラーが出る）
 *   - 通る migration → 0（誤検知で止めない）
 *   - **どちらの場合も DB が変わっていない**
 *
 * を実 DB で固定する。3 番目が抜けると、リハーサルのつもりが適用になっていても
 * 誰も気づかない。
 *
 * ## 見本は「手で分類していた頃に間違えた形」から採る
 *
 * 前身は SQL を分類してプローブを組む実装で、多角レビュー 2 巡で 21 件の
 * 取りこぼしが出た。ここに並ぶケースはその実例で、**どれも今は PostgreSQL が
 * 判定する**。写経に戻っていないことの回帰防止でもある。
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

const PARENT = "rehearsal_parent";
const CHILD = "rehearsal_child";

let prisma: PrismaClient;
let workDir: string;

function migrationDir(sql: string): string {
  const root = mkdtempSync(join(workDir, "mig-"));
  // timestamp 形の名前は使わない（`gates-do-not-pin-migrations.test.ts` の docblock 参照）。
  const name = "rehearsal_fixture";
  mkdirSync(join(root, name), { recursive: true });
  writeFileSync(join(root, name, "migration.sql"), sql, "utf8");
  return root;
}

/** 検査を走らせ、終了コードと「DB が変わっていないか」を返す。 */
async function check(
  sql: string,
): Promise<{ code: number; unchanged: boolean }> {
  const before = await snapshot();
  const code = await run(["--url", url, "--migrations", migrationDir(sql)]);
  const after = await snapshot();
  return { code, unchanged: before === after };
}

async function snapshot(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ fingerprint: string }[]>(
    `SELECT
       (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public')::text || '/' ||
       (SELECT COUNT(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'public')::text || '/' ||
       (SELECT COUNT(*) FROM "${CHILD}")::text AS fingerprint`,
  );
  return rows[0]?.fingerprint ?? "";
}

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "rehearsal-"));
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
  });
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${CHILD}"`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PARENT}"`);
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${PARENT}" ("id" text PRIMARY KEY)`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE TABLE "${CHILD}" ("id" text, "code" text, "total" integer, "note" text)`,
  );
  await prisma.$executeRawUnsafe(`INSERT INTO "${PARENT}" VALUES ('p1')`);
});

afterEach(async () => {
  await prisma.$executeRawUnsafe(`DELETE FROM "${CHILD}"`);
});

afterAll(async () => {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${CHILD}"`);
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PARENT}"`);
  // 巻き戻しが効いていれば残らないが、効かなかったときに次の run へ持ち越さない。
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "rehearsal_new_parent"`);
  await prisma.$disconnect();
  rmSync(workDir, { recursive: true, force: true });
});

async function seed(values: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${CHILD}" ("id", "code", "total", "note") VALUES ${values}`,
  );
}

describe("適用前リハーサル", () => {
  describe("落ちる migration は 1 を返す", () => {
    test("CHECK に違反する行がある", async () => {
      await seed(`('a','x',-1,'n'), ('b','y',5,'n')`);
      const result = await check(
        `BEGIN;
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_total_check" CHECK ("total" >= 0);
COMMIT;`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("同じ migration が足す列の既定値が制約に違反する", async () => {
      // 手で分類していた頃、既存行は「その列を持たない」と考えて素通りさせていた。
      // 実際には既定値が入る。
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
ALTER TABLE "${CHILD}" ADD COLUMN "score" integer NOT NULL DEFAULT -1;
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_score_check" CHECK ("score" >= 0);
COMMIT;`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("合成した既定値の型（文字列比較にすり替わらない）", async () => {
      // 分類実装では `'10' AS n` と型注釈なしで合成したため `'10' <= '9'` が
      // 文字列比較になり、落ちる migration を通していた。
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
ALTER TABLE "${CHILD}" ADD COLUMN "n" integer NOT NULL DEFAULT '10';
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_n_check" CHECK ("n" <= 9);
COMMIT;`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("式 index が評価できない行がある", async () => {
      // 分類実装のプローブは最適化で式を一度も評価していなかった。
      await seed(`('a','abc',1,'n')`);
      const result = await check(
        `CREATE INDEX "${CHILD}_code_int_idx" ON "${CHILD}" ((("code")::int));`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("ALTER COLUMN TYPE の USING 式が落ちる", async () => {
      await seed(`('a','x',1,'abc')`);
      const result = await check(
        `ALTER TABLE "${CHILD}" ALTER COLUMN "note" SET DATA TYPE integer USING ("note"::int);`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("重複がある列に UNIQUE を足す", async () => {
      await seed(`('a','dup',1,'n'), ('b','dup',1,'n')`);
      const result = await check(
        `ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_code_key" UNIQUE ("code");`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("参照先の無い行に FOREIGN KEY を足す", async () => {
      await seed(`('a','missing',1,'n')`);
      const result = await check(
        `ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_fk" FOREIGN KEY ("code") REFERENCES "${PARENT}"("id");`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("append-only trigger に当たる DML", async () => {
      // 分類実装は DML を safe としていた。実 DB で素通りが再現された形。
      const result = await check(
        `UPDATE "audit_logs" SET "metadata" = '{}'::jsonb WHERE "id" IS NOT NULL;`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });
  });

  describe("通る migration は 0 を返す", () => {
    test("既定値が制約を満たす", async () => {
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
ALTER TABLE "${CHILD}" ADD COLUMN "score" integer NOT NULL DEFAULT 0;
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_score_check" CHECK ("score" >= 0);
COMMIT;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("NOT VALID の制約は既存行を走査しない", async () => {
      // 分類実装は NOT VALID を捨てていたので、通る migration を止めていた。
      await seed(`('a','x',-5,'n')`);
      const result = await check(
        `ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_total_nv" CHECK ("total" >= 0) NOT VALID;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("同じ migration が作る表への FOREIGN KEY", async () => {
      // Prisma が「新しいモデルへの関連を足す」ときに出す形。分類実装は
      // まだ存在しない親表を引いて落ち、通る migration を止めていた。
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
CREATE TABLE "rehearsal_new_parent" ("id" text NOT NULL, CONSTRAINT "rehearsal_new_parent_pkey" PRIMARY KEY ("id"));
ALTER TABLE "${CHILD}" ADD COLUMN "parent_id" text;
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "rehearsal_new_parent"("id") ON DELETE SET NULL;
COMMIT;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("varchar 縮小で溢れるのが末尾空白だけ", async () => {
      await seed(`('a','x',1,'abc   ')`);
      const result = await check(
        `ALTER TABLE "${CHILD}" ALTER COLUMN "note" SET DATA TYPE VARCHAR(3);`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("GENERATED AS IDENTITY 列の追加", async () => {
      // 分類実装は列内制約と見なして拒否していた。実際は既存行も埋まる。
      await seed(`('a','x',1,'n'), ('b','y',2,'n')`);
      const result = await check(
        `ALTER TABLE "${CHILD}" ADD COLUMN "seq" integer GENERATED BY DEFAULT AS IDENTITY;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("DEFAULT の文字列リテラルにキーワードが入る", async () => {
      // 分類実装は `'{"a": null}'` の `null` で式を切って壊れた SQL を作っていた。
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
ALTER TABLE "${CHILD}" ADD COLUMN "cfg" jsonb NOT NULL DEFAULT '{"a": null}';
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_cfg_check" CHECK (jsonb_typeof("cfg") = 'object');
COMMIT;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("列を消して同名で作り直す（検査を伴えば通る）", async () => {
      // Prisma が型変更で出す形。分類実装は合成列が実列と衝突して壊れていた。
      //
      // 同名で作り直しても**旧い値は消える**ので、破壊として扱う。著者が
      // `DO $$ … RAISE EXCEPTION … $$` を置いていれば、その判断を採って通す。
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "${CHILD}" WHERE "${CHILD}"."note" IS NOT NULL AND "${CHILD}"."note" <> 'n') THEN
    RAISE EXCEPTION '移送していない note がある';
  END IF;
END $$;
ALTER TABLE "${CHILD}" DROP COLUMN "note", ADD COLUMN "note" integer NOT NULL DEFAULT 0;
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_note_check" CHECK ("note" >= 0);
COMMIT;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("列名を変えてから新しい名前で制約を付ける", async () => {
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
ALTER TABLE "${CHILD}" RENAME COLUMN "note" TO "memo";
ALTER TABLE "${CHILD}" ADD CONSTRAINT "${CHILD}_memo_check" CHECK ("memo" <> '');
COMMIT;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });
  });

  describe("流して確かめられない migration は止める", () => {
    test("巻き戻しを壊す文があれば、何も実行せずに 1", async () => {
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `ALTER TABLE "${CHILD}" ADD COLUMN "z" integer;
COMMIT;
SAVEPOINT s1;`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("CONCURRENTLY があれば 1", async () => {
      const result = await check(
        `CREATE INDEX CONCURRENTLY "${CHILD}_code_idx" ON "${CHILD}"("code");`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });
  });

  describe("migration 自身が持つ検査は、実行される", () => {
    // **破壊的変更の前提はここで持つ。** かつては SQL を静的に分類して
    // 「破壊的文には検査が要る」を強制する道具があったが、それは同 script が
    // 「収束しない」と結論した写経そのもので、5 回のレビューで塞ぎ続けることに
    // なった。破壊的 DDL は squawk（`ban-drop-column` 等）とデプロイの計画
    // ダウンタイムモードが見る。**この script が保証するのは 1 点だけ**——
    // migration が `DO $$ … RAISE EXCEPTION … $$` を書いたなら、それは
    // 「書いてあるだけ」にはならず、migrate の前に実際に評価される。
    //
    // リハーサルが破壊そのものを止めないことは下の 3 本目が示す。それは既知で、
    // header の「この方法が見ないもの」に書いてある（破壊はエラーではない）。

    test("成り立たない検査は migrate 前に落ちる（1・DB は不変）", async () => {
      // note が NULL の行を残したまま「NULL があれば止める」検査を置く。
      await seed(`('a','x',1,NULL)`);
      const result = await check(
        `BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "${CHILD}" WHERE "${CHILD}"."note" IS NULL) THEN
    RAISE EXCEPTION '空の note がある';
  END IF;
END $$;
ALTER TABLE "${CHILD}" DROP COLUMN "note";
COMMIT;`,
      );
      expect(result).toEqual({ code: 1, unchanged: true });
    });

    test("成り立つ検査は通る（0・DB は不変）", async () => {
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "${CHILD}" WHERE "${CHILD}"."note" IS NULL) THEN
    RAISE EXCEPTION '空の note がある';
  END IF;
END $$;
ALTER TABLE "${CHILD}" DROP COLUMN "note";
COMMIT;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });

    test("検査を書かなければ、破壊はここでは止まらない（0）", async () => {
      // この script の守備範囲を正直に固定する。`DROP COLUMN` は満杯の表でも
      // 成功するのでリハーサルは 0 を返す。止めるのは squawk の
      // `ban-drop-column` と、デプロイの計画ダウンタイムモード。
      await seed(`('a','x',1,'n')`);
      const result = await check(
        `BEGIN;
ALTER TABLE "${CHILD}" DROP COLUMN "note";
COMMIT;`,
      );
      expect(result).toEqual({ code: 0, unchanged: true });
    });
  });
});
