/**
 * クーポンのステータスフィルタ（active / limitReached）の統合テスト（実 DB 必須）。
 *
 * `getCoupons` の active / limitReached 経路は `$queryRaw` で生 SQL を発行する。
 * Coupon モデルは `@@map("coupons")`（schema.prisma）で物理テーブル名が `coupons` に
 * マップされているため、生 SQL が `FROM "Coupon"` を指すと Postgres が
 * `relation "Coupon" does not exist`（42P01）を投げて 500 になる回帰があった。
 * 本テストは実 DB に対してこの経路を実行し、(1) 例外なく解決すること、
 * (2) ステータス条件で正しく絞り込まれることを検証する（生 SQL の物理識別子ずれを検出）。
 *
 * ユニットテストは Prisma をモックして生 SQL を実行しないため、この回帰は
 * 統合テスト（実 Postgres）でのみ捕捉できる。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` が設定されているときのみ実行し、未設定なら describe ごと skip
 * する（開発者の dev DB を誤って汚染しないための安全弁）。gateway は import 時の
 * `process.env.DATABASE_URL` スナップショットを読むため、動的 import より前に上書きする。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { CouponType } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type QueriesModule = typeof import("@/shared/domain/coupons/queries");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let getCoupons: QueriesModule["getCoupons"];

// 全テストクーポンを 1 つの検索トークンでスコープし、DB に既存の他クーポンと混ざらない
// ようにする（getCoupons の search フィルタは raw SQL 経路でも ILIKE で効く）。
const SCOPE = `zzcoupontest-${crypto.randomUUID().slice(0, 8)}`;
const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);

async function seedCoupons(): Promise<void> {
  await prisma.coupon.createMany({
    data: [
      {
        // active 条件を満たす（有効・期間内・上限未到達）
        code: `${SCOPE}-active`.toUpperCase(),
        name: `${SCOPE} active`,
        type: CouponType.PERCENTAGE,
        discountValue: 10,
        validFrom: PAST,
        validUntil: null,
        usageLimit: null,
        usageCount: 0,
        isActive: true,
      },
      {
        // limitReached 条件を満たす（上限到達）。active 条件は満たさない。
        code: `${SCOPE}-limit`.toUpperCase(),
        name: `${SCOPE} limit`,
        type: CouponType.FIXED_AMOUNT,
        discountValue: 500,
        validFrom: PAST,
        validUntil: null,
        usageLimit: 5,
        usageCount: 5,
        isActive: true,
      },
      {
        // どちらの条件も満たさない（無効化済み）
        code: `${SCOPE}-inactive`.toUpperCase(),
        name: `${SCOPE} inactive`,
        type: CouponType.PERCENTAGE,
        discountValue: 20,
        validFrom: PAST,
        validUntil: null,
        usageLimit: null,
        usageCount: 0,
        isActive: false,
      },
    ],
  });
}

async function cleanupCoupons(): Promise<void> {
  await prisma.coupon.deleteMany({ where: { name: { startsWith: SCOPE } } });
}

describeMaybe("getCoupons — status filter raw SQL (@@map coupons)", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ getCoupons } = await import("@/shared/domain/coupons/queries"));
    await cleanupCoupons();
    await seedCoupons();
  });

  afterAll(async () => {
    await cleanupCoupons();
    await basePrisma.$disconnect();
  });

  test("status=active は raw SQL を例外なく実行し、active クーポンのみ返す", async () => {
    // 回帰の核心：以前は FROM \"Coupon\" で 42P01 を投げていた経路。
    const result = await getCoupons({ status: "active", search: SCOPE });

    expect(result.total).toBe(1);
    expect(result.coupons.map((c) => c.code)).toEqual([
      `${SCOPE}-active`.toUpperCase(),
    ]);
  });

  test("status=limitReached は raw SQL を例外なく実行し、上限到達クーポンのみ返す", async () => {
    const result = await getCoupons({ status: "limitReached", search: SCOPE });

    expect(result.total).toBe(1);
    expect(result.coupons.map((c) => c.code)).toEqual([
      `${SCOPE}-limit`.toUpperCase(),
    ]);
  });
});
