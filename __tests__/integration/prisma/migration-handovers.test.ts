/**
 * `HANDOVERS` の SQL が**実 DB で本当に答える**ことの検査。
 *
 * ## なぜ unit では足りないか
 *
 * `destructive-migration-has-executed-assertion.test.ts` は「登録があること」しか
 * 見られない。登録された SQL が構文エラーでも、存在しない列を見ていても、
 * 常に 0 を返すだけでも、unit は緑のままになる。そして 0 を返す SQL は
 * **デプロイ経路をそのまま素通しする** —— 守っているように見えて何も守らない
 * （`.claude/rules/customer-experience-kgi.md` の vacuous-gate）。
 *
 * だからここでは、答えが**状態によって変わること**を実 DB で固定する。
 * 未引き継ぎの値を置けば 0 でなくなり、引き継げば 0 になる。両方を見るので、
 * 定数を返す SQL では通らない。
 *
 * ## 消える列を、消えた後の DB でどう試すか
 *
 * test DB は `migrate deploy` 済みなので `locations.special_holidays` は既に無い。
 * トランザクションの中で列を作り直し、見本を入れ、数え、**必ず巻き戻す**。
 * リハーサル本体と同じ作法で、この検査自体は DB を残さない。
 *
 * == 実行条件 ==
 * `bun run test:integration`（test-db を自動起動 + migrate deploy）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";

import { HANDOVERS } from "../../../scripts/migration-preconditions";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);

let prisma: PrismaClient;

/** 巻き戻し専用。これを投げてトランザクションを終える。 */
class Rollback extends Error {}

/** 見本を置いて数えて、**必ず**巻き戻す。 */
async function measure(
  seed: (
    tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  ) => Promise<number[]>,
): Promise<number[]> {
  let counts: number[] = [];
  try {
    await prisma.$transaction(async (tx) => {
      counts = await seed(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
  return counts;
}

async function count(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  sql: string,
): Promise<number> {
  const [row] = await tx.$queryRawUnsafe<{ n: bigint }[]>(sql);
  return Number(row?.n ?? 0);
}

describe("HANDOVERS の SQL は実 DB で状態に応じて答える", () => {
  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("登録が 1 件以上ある（この検査が空振りしていない）", () => {
    expect(HANDOVERS.length).toBeGreaterThan(0);
  });

  test("locations.special_holidays: 未移送なら数え、移送済みなら 0", async () => {
    const handover = HANDOVERS.find(
      (entry) => entry.target === "locations.special_holidays",
    );
    expect(handover).toBeDefined();
    if (handover === undefined) return;

    const [empty, unhanded, handedOver] = await measure(async (tx) => {
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

      return [empty, unhanded, handedOver];
    });

    expect(empty).toBe(0);
    // 2 件とも未引き継ぎ。
    expect(unhanded).toBe(2);
    // 移せた 1 件が減り、読めない 1 件は残る（消える値として報告され続ける）。
    expect(handedOver).toBe(1);
  }, 30_000);

  test("巻き戻っている（列を残していない）", async () => {
    const [present] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'locations'
           AND column_name = 'special_holidays'`,
    );
    expect(Number(present?.n ?? 0)).toBe(0);
  });
});
