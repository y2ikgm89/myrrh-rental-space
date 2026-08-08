/**
 * `HANDOVERS` の SQL が**実 DB で本当に答える**ことと、答えを受けて
 * リハーサルが**本当に止まる**ことの検査。
 *
 * ## なぜ unit では足りないか
 *
 * `destructive-migration-has-executed-assertion.test.ts` は「登録があること」しか
 * 見られない。登録された SQL が構文エラーでも、存在しない列を見ていても、
 * 常に 0 を返すだけでも、unit は緑のままになる。そして 0 を返す SQL は
 * **デプロイ経路をそのまま素通しする** —— 守っているように見えて何も守らない
 * （`.claude/rules/customer-experience-kgi.md` の vacuous-gate）。
 *
 * 多角監査で実測された穴もここに属する: 引き継ぎが 0 でないときに止める枝も、
 * SQL が読めなかったときに拒否する枝も、**どのテストからも 1 度も実行されて
 * いなかった**（両方を潰すミューテーションを入れてもテストが緑のままだった）。
 *
 * ## 何を固定するか
 *
 * 1. 登録された SQL の答えが**状態によって変わる**（定数を返す SQL では通らない）
 * 2. 答えが 0 でなければ `rehearse` が破壊的文を**実行せずに**止める
 * 3. 答えが読み取れない（0 行 / NULL / 非数値 / 複数行 / 構文エラー）ときも止める。
 *    「確かめられなかった」を「確かめて 0 だった」に化けさせない
 * 4. 登録 1 件ごとに、状態遷移の見本がこのファイルにある（`COVERED` で強制）
 *
 * 2 と 3 は**デプロイ経路と同じ `rehearse` を呼んで**確かめる。判定を書き写すと、
 * 書き写した側だけが緑になる（`.claude/rules/testing-unit.md` の 4 点目）。
 *
 * ## `HANDOVERS` が空でも、ここは空振りしない
 *
 * 1 と 4 は登録があるぶんだけを見るので、登録が 0 件なら何も見ない。
 * 2 と 3 —— 仕組みそのもの —— は登録に依らず、このファイルが自前で立てる
 * 見本の表（`handover_probe`）に対して毎回実行する。登録が空になったときに
 * 検査ごと空振りする作りにはしない。
 *
 * == 実行条件 ==
 * `bun run test:integration`（test-db を自動起動 + migrate deploy）。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

import {
  HANDOVERS,
  pendingStatements,
  rehearse,
  type Handover,
} from "../../../scripts/migration-preconditions";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);

/**
 * 状態遷移の見本をこのファイルに持っている登録。
 *
 * `HANDOVERS` に足すときはここにも足す。足さなければ下のテストが落ちる——
 * 登録だけ増えて「実 DB で答えるか」を誰も確かめない状態を作らないため。
 */
const COVERED: readonly string[] = [];

/** 引き継ぎの見本用。migration が触る表とは別に立てる。 */
const PROBE = "handover_probe";
const PROBE_COUNT = `SELECT count(*) AS n FROM "${PROBE}" WHERE "note" IS NOT NULL`;

let prisma: PrismaClient;

function probeHandover(countUnhandedOver: string): Handover {
  return {
    target: `${PROBE}.note`,
    what: "note が引き継がれていない",
    countUnhandedOver,
    remedy: "bun scripts/handover-probe.ts --apply",
  };
}

/**
 * 見本の列を落とす migration を、デプロイ経路と同じ `rehearse` で流す。
 *
 * 表は外で作る。同じ migration の中で作った表・列は「失うものが無い」として
 * 引き継ぎを要求しない仕様なので、中で作ると検査そのものが素通りする。
 */
async function rehearseDropNote(handover: Handover) {
  const { steps, blocked } = pendingStatements(
    [
      {
        name: "handover_probe_fixture",
        sql: `ALTER TABLE "${PROBE}" DROP COLUMN "note";`,
      },
    ],
    new Set<string>(),
    [handover],
  );
  expect(blocked).toEqual([]);
  expect(steps.map((step) => step.handovers.length)).toEqual([1]);
  return rehearse(prisma, steps);
}

describe("HANDOVERS は実 DB で答え、答えを受けて止まる", () => {
  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PROBE}"`);
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "${PROBE}" ("id" serial PRIMARY KEY, "note" text)`,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${PROBE}"`);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "${PROBE}"`);
  });

  test("登録 1 件ごとに、このファイルに見本がある", () => {
    expect(HANDOVERS.map(({ target }) => target).toSorted()).toEqual(
      [...COVERED].toSorted(),
    );
  });

  test("引き継ぎが残っていれば、破壊的文を実行せずに止める", async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${PROBE}" ("note") VALUES ('まだ移していない')`,
    );

    const failure = await rehearseDropNote(probeHandover(PROBE_COUNT));

    expect(failure).not.toBeNull();
    expect(failure?.sql).toContain("DROP COLUMN");
    expect(failure?.error).toContain("note が引き継がれていない（1 件）");
    expect(failure?.error).toContain("bun scripts/handover-probe.ts --apply");

    // 列は消えていない（止めたので実行していない）。
    const [left] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = '${PROBE}'
           AND column_name = 'note'`,
    );
    expect(Number(left?.n ?? 0)).toBe(1);
  }, 30_000);

  test("引き継ぎが済んでいれば通す（誤検知で止めない）", async () => {
    expect(await rehearseDropNote(probeHandover(PROBE_COUNT))).toBeNull();
  }, 30_000);

  test("答えが読み取れなければ止める（0 件扱いにしない）", async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${PROBE}" ("note") VALUES ('a'), ('b')`,
    );

    for (const broken of [
      // 0 行
      `SELECT count(*) AS n FROM "${PROBE}" WHERE false GROUP BY "id"`,
      // NULL
      "SELECT NULL AS n",
      // 非数値
      "SELECT 'たくさん' AS n",
      // 複数行
      `SELECT "id" AS n FROM "${PROBE}"`,
      // 構文エラー
      "SELECT COUNT(* AS n",
      // 列名違い
      "SELECT 0 AS m",
      // 存在しない表
      `SELECT count(*) AS n FROM "handover_probe_does_not_exist"`,
    ]) {
      const failure = await rehearseDropNote(probeHandover(broken));
      expect(failure, broken).not.toBeNull();
      expect(failure?.error, broken).toContain("引き継ぎを確かめられない");
    }
  }, 60_000);
});
