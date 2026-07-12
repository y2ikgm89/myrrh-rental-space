/**
 * 予約スペース時間帯の二重予約防止（advisory lock 直列化）の統合テスト（実 DB 必須）。
 *
 * 空き確認は read-before-write のため、`lockSpaceForTransaction`
 * （src/shared/domain/reservations/space-locks.ts、`pg_advisory_xact_lock(728351, hashtext(spaceId))`）
 * による直列化が無いと、同一スペース・重複時間帯への同時申込が全部「空きあり」を
 * 観測して通過し、複数の CONFIRMED 予約が作成される（ダブルブッキング）TOCTOU 競合になる
 * （CLAUDE.md 絶対規約8 / .claude/rules/business-domain.md「予約の同時実行制御」）。
 *
 * 既存の commands.test.ts の同等テストは Prisma を丸ごと mock しており、
 * 「advisory lock の SQL 文字列が $executeRaw に渡された」ことしか検証できない。
 * 本テストは実 Postgres 上で N 並行申込を投げ、最終的に該当スペース・時間帯の
 * CONFIRMED 予約がちょうど 1 件のみになることを検証する
 * （registration-overbooking.test.ts のイベント定員テストと同型）。
 *
 * `createAdminReservationCommand` を駆動に使う（feature module gate や
 * TermsAgreement 必須化を持たない admin 経路。lock/overlap のコアロジックは
 * public 経路と共通のため、並行性検証としてはこちらが最小構成）。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する（advisory lock の直列化挙動は mock では再現不能）。
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。直接
 * `bun test` でこのファイルを実行し `TEST_DATABASE_URL` が未設定の場合のみ
 * describe ごと skip する（dev DB を誤って汚染しないための安全弁）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReservationStatus } from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type AdminCommandsModule =
  typeof import("@/shared/domain/reservations/admin-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createAdminReservationCommand: AdminCommandsModule["createAdminReservationCommand"];

type SpaceFixture = {
  spaceId: string;
  customerId: string;
  cleanup: () => Promise<void>;
};

let nextFixtureLocationSortOrder = 1_200_000_000;

/** Location → Space → Customer を 1 件ずつ作る最小 fixture。 */
async function createSpaceFixture(): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `overlap-loc-${suffix}`,
      name: `Overlap Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureLocationSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `overlap-space-${suffix}`,
      name: `Overlap Space ${suffix}`,
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

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `overlap-${suffix}@example.com`,
      emailCanonical: `overlap-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    cleanup: async () => {
      // FK 安全な順序（Space→Location は Restrict）
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

/** 同一スペース・完全に重複する時間帯へ N 並行で予約作成を投げる。 */
async function reserveConcurrently(
  spaceId: string,
  customerId: string,
  date: string,
  count: number,
): Promise<PromiseSettledResult<unknown>[]> {
  return Promise.allSettled(
    Array.from({ length: count }, () =>
      createAdminReservationCommand({
        spaceId,
        date,
        startTime: "10:00",
        endTime: "12:00",
        customerId,
        status: ReservationStatus.CONFIRMED,
      }),
    ),
  );
}

const CONCURRENCY = 5;

describeMaybe(
  "createAdminReservationCommand — スペース時間帯の二重予約防止",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ createAdminReservationCommand } =
        await import("@/shared/domain/reservations/admin-commands"));
      // 接続プールをウォームアップ（コールドスタートが並行クエリをずらして race を隠すのを防ぐ）。
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await basePrisma.$disconnect();
    });

    test("同一スペース・完全に重複する時間帯へ 5 並行予約しても CONFIRMED はちょうど 1 件", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      const date = "2027-03-15";

      try {
        const results = await reserveConcurrently(
          spaceId,
          customerId,
          date,
          CONCURRENCY,
        );

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );

        // 核心の不変条件：同一時間帯の CONFIRMED 予約は 1 件のみ（ダブルブッキング防止）。
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(CONCURRENCY - 1);
        // 敗者は全員 overlap による CONFLICT で拒否される。
        for (const r of rejected) {
          expect(r.reason).toMatchObject({ code: "CONFLICT" });
        }

        const confirmedCount = await prisma.reservation.count({
          where: {
            spaceId,
            deletedAt: null,
            status: ReservationStatus.CONFIRMED,
          },
        });
        expect(confirmedCount).toBe(1);
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
