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
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。直接
 * `bun test` でこのファイルを実行し `TEST_DATABASE_URL` が未設定の場合のみ
 * describe ごと skip する（dev DB を誤って汚染しないための安全弁）。gateway は
 * import 時の `process.env.DATABASE_URL` スナップショットを読むため、動的 import より
 * 前に上書きする。
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

    // $queryRaw は Prisma の result 拡張をバイパスする（公式仕様）。
    // queries.ts の row mapping で Decimal→number に正規化されていることを
    // 直接検証する（findMany 経路と型契約を揃えるため）。Intl 整形を呼ぶ
    // 下流（formatCoupon の toLocaleString 等）が壊れる経路の回帰防止。
    const active = result.coupons[0];
    expect(active).toBeDefined();
    if (active === undefined) {
      throw new Error("active coupon must exist");
    }
    expect(typeof active.discountValue).toBe("number");
    expect(active.discountValue).toBe(10);
    expect(active.minReservationAmount).toBeNull();
    expect(active.maxDiscountAmount).toBeNull();
  });

  test("status=limitReached は raw SQL を例外なく実行し、上限到達クーポンのみ返す", async () => {
    const result = await getCoupons({ status: "limitReached", search: SCOPE });

    expect(result.total).toBe(1);
    expect(result.coupons.map((c) => c.code)).toEqual([
      `${SCOPE}-limit`.toUpperCase(),
    ]);

    // Decimal→number 正規化の回帰防止（FIXED_AMOUNT 値も number で揃える）。
    const limit = result.coupons[0];
    expect(limit).toBeDefined();
    if (limit === undefined) {
      throw new Error("limit reached coupon must exist");
    }
    expect(typeof limit.discountValue).toBe("number");
    expect(limit.discountValue).toBe(500);
  });
});
