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
 * ## 消える列を、消えた後の DB でどう試すか
 *
 * test DB は `migrate deploy` 済みなので `locations.special_holidays` は既に無い。
 * トランザクションの中で列を作り直し、見本を入れ、数え、**必ず巻き戻す**。
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
  readGapCount,
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
const COVERED = ["locations.special_holidays"];

/** 引き継ぎの見本用。migration が触る表とは別に立てる。 */
const PROBE = "handover_probe";
const PROBE_COUNT = `SELECT count(*) AS n FROM "${PROBE}" WHERE "note" IS NOT NULL`;

let prisma: PrismaClient;

/** 巻き戻し専用。これを投げてトランザクションを終える。 */
class Rollback extends Error {}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** 見本を置いて数えて、**必ず**巻き戻す。 */
async function measure<T>(seed: (tx: Tx) => Promise<T>): Promise<T | null> {
  let captured: T | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      captured = await seed(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return captured;
}

async function count(tx: Tx, sql: string): Promise<number> {
  return readGapCount(await tx.$queryRawUnsafe<Record<string, unknown>[]>(sql));
}

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
    expect(HANDOVERS.length).toBeGreaterThan(0);
    expect(HANDOVERS.map(({ target }) => target).toSorted()).toEqual(
      [...COVERED].toSorted(),
    );
  });

  test("locations.special_holidays: 未移送なら数え、移送済みなら 0", async () => {
    const handover = HANDOVERS.find(
      (entry) => entry.target === "locations.special_holidays",
    );
    expect(handover).toBeDefined();
    if (handover === undefined) return;

    const measured = await measure(async (tx) => {
      // 列を作り直す。p9 が落としたのと同じ形。
      await tx.$executeRawUnsafe(
        `ALTER TABLE "locations" ADD COLUMN "special_holidays" JSONB`,
      );

      const locationId = "00000000-0000-4000-8000-00000000c001";
      const userId = "00000000-0000-4000-8000-00000000c002";
      await tx.$executeRawUnsafe(
        `INSERT INTO "users" (id, email, name, updated_at)
           VALUES ($1::uuid, 'handover@example.test', '引き継ぎ検査', NOW())`,
        userId,
      );
      // sort_order は `locations_active_sort_order_key`（有効な拠点で一意）に
      // 効く。既定の 0 は既存行が使っているので、衝突しない値を明示する。
      await tx.$executeRawUnsafe(
        `INSERT INTO "locations" (id, slug, name, address, image_url, sort_order, updated_at)
           VALUES ($1::uuid, 'handover-probe', '引き継ぎ検査', '住所', '/x.png', 990001, NOW())`,
        locationId,
      );

      // 1. 列はあるが空 → 数えるものが無い。
      const empty = await count(tx, handover.countUnhandedOver);

      // 2. 未移送の日付を置く。読めない値も混ぜる（移送スクリプトが飛ばす側）。
      await tx.$executeRawUnsafe(
        `UPDATE "locations" SET special_holidays = '["2099-01-01", "こわれた値"]'::jsonb
           WHERE id = $1::uuid`,
        locationId,
      );
      const unhanded = await count(tx, handover.countUnhandedOver);

      // 3. 読める側を BlockedDate へ移す。読めない値は移せないので残る。
      await tx.$executeRawUnsafe(
        `INSERT INTO "blocked_dates"
           (id, scope, location_id, start_date, end_date, type, reason, created_by, updated_at)
           VALUES (gen_random_uuid(), 'LOCATION', $1::uuid, DATE '2099-01-01', DATE '2099-01-01',
                   'HOLIDAY', '特別休業日', $2::uuid, NOW())`,
        locationId,
        userId,
      );
      const handedOver = await count(tx, handover.countUnhandedOver);

      return { empty, unhanded, handedOver };
    });

    expect(measured).toEqual({
      empty: 0,
      // 2 件とも未引き継ぎ。
      unhanded: 2,
      // 移せた 1 件が減り、読めない 1 件は残る（消える値として報告され続ける）。
      handedOver: 1,
    });
  }, 30_000);

  test("巻き戻っている（locations に列を残していない）", async () => {
    const [present] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations'
           AND column_name = 'special_holidays'`,
    );
    expect(Number(present?.n ?? 0)).toBe(0);
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
