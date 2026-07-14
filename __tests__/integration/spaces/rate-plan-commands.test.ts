/**
 * SpaceRatePlan CRUD command の統合テスト（実 DB 必須）。
 *
 * src/shared/domain/spaces/rate-plan-commands.ts の
 * createSpaceRatePlan / updateSpaceRatePlan / deleteSpaceRatePlan を検証する。
 * Space 削除時の cascade 削除は DB の `onDelete: Cascade` 制約そのものの検証が
 * 目的のため、実 Postgres が必須（mock では再現できない）。
 *
 * `invalidateSpaceRatePlansCache`（Task 5）は内部で `next/cache` の `updateTag` を
 * 呼ぶが、`updateTag` は Server Action コンテキスト外（本ファイルのような素の
 * bun:test 実行）で呼ぶと Next.js 公式仕様により throw する
 * ("updateTag can only be called from within a Server Action")。
 * 既存の Server Action 統合テスト群（例: event-registration.test.ts）と同じ
 * パターンで `next/cache` を no-op mock する。
 *
 * `seedSpaceForTest` 共有 helper は `__tests__/integration/_helpers/` に存在しないため
 * （2026-07-14 時点で未作成）、blacklist-guard.test.ts と同型の fixture をこの
 * ファイル内にインラインする。fixture 作成・cleanup は describe 直下の
 * `beforeEach`/`afterEach` 共有 `let` ではなく **各 test 内の try/finally** に
 * 意図的に閉じ込める（blacklist-guard.test.ts と同型）。理由: 共有 `let` 方式では
 * `beforeEach` が例外を投げた場合に変数が `undefined` のまま `afterEach` に渡り、
 * Prisma の `deleteMany({ where: { id: undefined } })` は当該フィールドの条件を
 * 丸ごと無視する（undefined キーは where から除外される公式仕様）ため
 * `deleteMany({ where: {} })` と等価になり **テーブル全体を削除する**。
 * 実装初期にこの経路で共有 test-db の locations/spaces を全削除する事故を実測したため、
 * try/finally で fixture のライフサイクルを test 単位に厳密に閉じる。
 *
 * Location の `sortOrder`（既定 0）には `isActive: true` 時のみ有効な部分 unique
 * index があるため、fixture は `isActive: false` で作成し衝突を回避する
 * （blacklist-guard.test.ts と同じ回避策）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// rate-plan-commands.ts → space-rate-plan-cache.ts が呼ぶ `updateTag` は
// Server Action コンテキスト外で throw するため no-op mock する
// （import より前に配置。mock.module() は宣言後の動的 import にのみ適用される）。
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
  revalidateTag: mock(() => undefined),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/spaces/rate-plan-commands");

type DomainErrorModule = typeof import("@/shared/domain/domain-error");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createSpaceRatePlan: CommandsModule["createSpaceRatePlan"];
let updateSpaceRatePlan: CommandsModule["updateSpaceRatePlan"];
let deleteSpaceRatePlan: CommandsModule["deleteSpaceRatePlan"];
let DomainError: DomainErrorModule["DomainError"];

type SpaceFixture = {
  spaceId: string;
  cleanup: () => Promise<void>;
};

/** Location → Space を 1 件ずつ作る最小 fixture（SpaceRatePlan の親）。 */
async function seedSpaceForTest(): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `rate-plan-cmd-loc-${suffix}`,
      name: `Rate Plan Cmd Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/location.jpg",
      // sortOrder(既定 0) は isActive:true 時のみ有効な部分 unique index を持つ。
      // 他 fixture との衝突を避けるため非 active で作成する。
      isActive: false,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `rate-plan-cmd-space-${suffix}`,
      name: `Rate Plan Cmd Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    cleanup: async () => {
      // FK 安全な順序（Space→Location は Restrict）。cascade テストで既に
      // Space を削除済みの場合も deleteMany は 0 件ヒットで安全（no-op）。
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("SpaceRatePlan CRUD", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ createSpaceRatePlan, updateSpaceRatePlan, deleteSpaceRatePlan } =
      await import("@/shared/domain/spaces/rate-plan-commands"));
    ({ DomainError } = await import("@/shared/domain/domain-error"));
    await basePrisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("createSpaceRatePlan: 基本 field で作成できる", async () => {
    const { spaceId, cleanup } = await seedSpaceForTest();
    try {
      const plan = await createSpaceRatePlan({
        spaceId,
        name: "金曜料金",
        hourlyPrice: 4000,
        daysOfWeek: ["FRIDAY"],
        holidayMode: "any",
        startTime: null,
        endTime: null,
        effectiveFrom: null,
        effectiveTo: null,
      });
      expect(plan.name).toBe("金曜料金");
      // hourlyPrice は createAppPrismaClient の result 拡張により create() の
      // 戻り値時点で既に number（Prisma.Decimal ではない）。
      expect(plan.hourlyPrice).toBe(4000);

      const found = await prisma.spaceRatePlan.findUnique({
        where: { id: plan.id },
      });
      expect(found).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("updateSpaceRatePlan: updatedAt が bump される (last-updated-wins)", async () => {
    const { spaceId, cleanup } = await seedSpaceForTest();
    try {
      const plan = await createSpaceRatePlan({
        spaceId,
        name: "初期",
        hourlyPrice: 3000,
        daysOfWeek: [],
        holidayMode: "any",
        startTime: null,
        endTime: null,
        effectiveFrom: null,
        effectiveTo: null,
      });
      const initialUpdatedAt = plan.updatedAt;

      await new Promise((r) => setTimeout(r, 10)); // updatedAt 差分確保

      const updated = await updateSpaceRatePlan(plan.id, {
        hourlyPrice: 5000,
      });
      expect(updated.hourlyPrice).toBe(5000);
      expect(updated.updatedAt.getTime()).toBeGreaterThan(
        initialUpdatedAt.getTime(),
      );
    } finally {
      await cleanup();
    }
  });

  test("deleteSpaceRatePlan: 削除される", async () => {
    const { spaceId, cleanup } = await seedSpaceForTest();
    try {
      const plan = await createSpaceRatePlan({
        spaceId,
        name: "削除対象",
        hourlyPrice: 3000,
        daysOfWeek: [],
        holidayMode: "any",
        startTime: null,
        endTime: null,
        effectiveFrom: null,
        effectiveTo: null,
      });
      await deleteSpaceRatePlan(plan.id);
      const found = await prisma.spaceRatePlan.findUnique({
        where: { id: plan.id },
      });
      expect(found).toBeNull();
    } finally {
      await cleanup();
    }
  });

  // `expect(promise).rejects` は実DB(複数 await I/O を経る)呼び出しに対して
  // Bun 1.3.14 でハングする既知の問題があるため、明示 try/catch で検証する
  // ([[feedback_bun-rejects-hang-and-npm-script-args]] 参照)。
  test("updateSpaceRatePlan: 存在しない id は DomainError(NOT_FOUND) を throw する", async () => {
    let caught: unknown;
    try {
      await updateSpaceRatePlan("nonexistent-rate-plan-id", {
        hourlyPrice: 1000,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DomainError);
    if (caught instanceof DomainError) {
      expect(caught.code).toBe("NOT_FOUND");
    }
  });

  test("deleteSpaceRatePlan: 存在しない id は DomainError(NOT_FOUND) を throw する", async () => {
    let caught: unknown;
    try {
      await deleteSpaceRatePlan("nonexistent-rate-plan-id");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DomainError);
    if (caught instanceof DomainError) {
      expect(caught.code).toBe("NOT_FOUND");
    }
  });

  test("Space 削除で cascade される", async () => {
    const { spaceId, cleanup } = await seedSpaceForTest();
    try {
      const plan = await createSpaceRatePlan({
        spaceId,
        name: "cascade test",
        hourlyPrice: 3000,
        daysOfWeek: [],
        holidayMode: "any",
        startTime: null,
        endTime: null,
        effectiveFrom: null,
        effectiveTo: null,
      });
      await prisma.space.delete({ where: { id: spaceId } });
      const found = await prisma.spaceRatePlan.findUnique({
        where: { id: plan.id },
      });
      expect(found).toBeNull();
    } finally {
      await cleanup();
    }
  });
});
