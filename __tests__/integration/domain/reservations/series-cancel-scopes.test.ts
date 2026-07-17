/**
 * `cancelReservationSeriesCommand` の実 DB 統合テスト（Phase B.2 task 13）。
 *
 * this-only / this-and-following / series-all の 3 scope（Google Calendar 業界標準）で
 * 実際に DB へ反映される内容を検証する（mock では atomic claim の WHERE 句や
 * coupon usageCount の decrement guard（`usageCount: { gt: 0 }`）の実効性が
 * 確認できないため実 Postgres が必須）:
 *
 *   - this-only: 指定した 1 instance のみ CANCELLED、series 行は未変更
 *   - this-and-following: 指定 instance 以降が全て CANCELLED、それ以前は現状維持
 *   - series-all: 残存 instance が全て CANCELLED + series 行が soft-delete
 *     （cancelledAt/cancelledByType/cancellationReason/deletedAt）+
 *     series.couponId があれば usageCount を 1 decrement
 *   - series-all の二重実行は 2 回目が CONFLICT で reject され、coupon が
 *     二重 decrement されない（`usageCount: { gt: 0 }` guard の実効性）
 *
 * fixture の series/instance 作成は `createReservationSeriesCommand`
 * （series-overlap.test.ts で実 DB 検証済み）をそのまま使う。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe ごと skip）。gateway は
 * import 時の `process.env.DATABASE_URL` を読むため、動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  CouponType,
  ReservationStatus,
  TaxRateType,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type SeriesCommandsModule =
  typeof import("@/shared/domain/reservations/series-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createReservationSeriesCommand: SeriesCommandsModule["createReservationSeriesCommand"];
let cancelReservationSeriesCommand: SeriesCommandsModule["cancelReservationSeriesCommand"];

const TEMPLATE_DATA = {
  totalPrice: 5000,
  basePrice: 5000,
  rateBreakdownJson: {
    schemaVersion: 1 as const,
    segments: [],
    totalHours: 2,
    totalBasePrice: 5000,
    holidayFlags: {},
    legacy: true,
  },
  taxRateType: TaxRateType.standard,
  taxRate: 10,
  taxAmount: 500,
  totalPriceWithTax: 5500,
};

const REQUEST_CONTEXT = { ip: "203.0.113.10", userAgent: "Mozilla/5.0 (Test)" };

type SpaceFixture = {
  spaceId: string;
  customerId: string;
  cleanup: () => Promise<void>;
};

// Location.sortOrder は unique 制約。同一の永続 test-db に対して本ファイルを 2 回以上
// 実行するとカウンター方式では前回残骸との collision が起きる（claim-commands.test.ts
// 同型 fix、Postgres int32 有符号範囲内の 1.5B〜2.0B に収める）。
function randomSortOrder(): number {
  return Math.floor(Math.random() * 500_000_000) + 1_500_000_000;
}

/** Location → Space → Customer を 1 件ずつ作る最小 fixture（series-overlap.test.ts と同型）。 */
async function createSpaceFixture(): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `series-cancel-loc-${suffix}`,
      name: `Series Cancel Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: randomSortOrder(),
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `series-cancel-space-${suffix}`,
      name: `Series Cancel Space ${suffix}`,
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
      email: `series-cancel-${suffix}@example.com`,
      emailCanonical: `series-cancel-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    cleanup: async () => {
      // brief 記載の cleanup 順序: Reservation → Coupon → ReservationSeries →
      // Space → Customer → Location（Coupon は呼出側が別途 cleanup する）。
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.reservationSeries.deleteMany({
        where: { spaceId: space.id },
      });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function ensureSettings(maxRecurrenceInstances = 26): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", maxRecurrenceInstances },
    update: { maxRecurrenceInstances },
  });
}

async function createCouponFixture(): Promise<{
  couponId: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto
    .randomUUID()
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase();
  const coupon = await prisma.coupon.create({
    data: {
      code: `SERIESCANCEL${suffix}`,
      name: "Series cancel test coupon",
      type: CouponType.FIXED_AMOUNT,
      discountValue: 500,
      validFrom: new Date("2020-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  return {
    couponId: coupon.id,
    cleanup: async () => {
      await prisma.coupon.deleteMany({ where: { id: coupon.id } });
    },
  };
}

type SeriesFixture = { seriesId: string; instanceIds: string[] };

/** `createReservationSeriesCommand` を使って WEEKLY 火曜 series を実 DB に作る。 */
async function createSeriesFixture(
  spaceId: string,
  customerId: string,
  opts: { dtstart: Date; count: number; couponId?: string | null },
): Promise<SeriesFixture> {
  const result = await createReservationSeriesCommand({
    spaceId,
    customerId,
    couponId: opts.couponId ?? null,
    rrule: `FREQ=WEEKLY;BYDAY=TU;COUNT=${String(opts.count)}`,
    dtstart: opts.dtstart,
    duration: 120,
    templateData: TEMPLATE_DATA,
    agreements: [],
    now: new Date(),
  });
  return { seriesId: result.series.id, instanceIds: result.instanceIds };
}

async function fetchReservationRows(
  ids: string[],
): Promise<
  { id: string; status: ReservationStatus; cancelledByType: string | null }[]
> {
  return prisma.reservation.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, cancelledByType: true },
  });
}

describeMaybe(
  "cancelReservationSeriesCommand — this-only / this-and-following / series-all (integration)",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ createReservationSeriesCommand, cancelReservationSeriesCommand } =
        await import("@/shared/domain/reservations/series-commands"));
      await prisma.$queryRaw`SELECT 1`;
      await ensureSettings(26);
    });

    afterAll(async () => {
      await basePrisma.$disconnect();
    });

    test("this-only: 指定した 1 instance のみ CANCELLED になり、series 行は未変更", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      try {
        const { seriesId, instanceIds } = await createSeriesFixture(
          spaceId,
          customerId,
          { dtstart: new Date("2027-09-07T10:00:00.000Z"), count: 3 },
        );
        expect(instanceIds).toHaveLength(3);
        const target = instanceIds[1];
        if (!target) throw new Error("fixture instance missing");

        const result = await cancelReservationSeriesCommand({
          seriesId,
          scope: "this-only",
          fromInstanceId: target,
          cancelledByType: "ADMIN",
          cancellationReason: "テスト都合",
          request: REQUEST_CONTEXT,
          now: new Date(),
        });

        expect(result.cancelledCount).toBe(1);
        expect(result.cancelledReservationIds).toEqual([target]);

        const rows = await fetchReservationRows(instanceIds);
        const byId = new Map(rows.map((r) => [r.id, r]));
        expect(byId.get(target)?.status).toBe(ReservationStatus.CANCELLED);
        expect(byId.get(target)?.cancelledByType).toBe("ADMIN");
        for (const id of instanceIds) {
          if (id === target) continue;
          expect(byId.get(id)?.status).toBe(ReservationStatus.CONFIRMED);
        }

        const series = await prisma.reservationSeries.findUniqueOrThrow({
          where: { id: seriesId },
          select: { deletedAt: true, cancelledAt: true },
        });
        expect(series.deletedAt).toBeNull();
        expect(series.cancelledAt).toBeNull();
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("this-and-following: 指定 instance 以降が全て CANCELLED、それ以前は CONFIRMED のまま", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      try {
        const { seriesId, instanceIds } = await createSeriesFixture(
          spaceId,
          customerId,
          { dtstart: new Date("2027-10-05T10:00:00.000Z"), count: 4 },
        );
        expect(instanceIds).toHaveLength(4);
        const fromId = instanceIds[1];
        const untouchedId = instanceIds[0];
        if (!fromId || !untouchedId)
          throw new Error("fixture instance missing");

        const result = await cancelReservationSeriesCommand({
          seriesId,
          scope: "this-and-following",
          fromInstanceId: fromId,
          cancelledByType: "ADMIN",
          request: REQUEST_CONTEXT,
          now: new Date(),
        });

        const expectedCancelled = instanceIds.slice(1);
        expect(result.cancelledCount).toBe(3);
        expect([...result.cancelledReservationIds].sort()).toEqual(
          [...expectedCancelled].sort(),
        );

        const rows = await fetchReservationRows(instanceIds);
        const byId = new Map(rows.map((r) => [r.id, r]));
        expect(byId.get(untouchedId)?.status).toBe(ReservationStatus.CONFIRMED);
        for (const id of expectedCancelled) {
          expect(byId.get(id)?.status).toBe(ReservationStatus.CANCELLED);
        }

        const series = await prisma.reservationSeries.findUniqueOrThrow({
          where: { id: seriesId },
          select: { deletedAt: true },
        });
        expect(series.deletedAt).toBeNull();
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("series-all: 全 instance が CANCELLED、series が soft-delete され、coupon usageCount が 1 decrement される", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      const couponFixture = await createCouponFixture();
      try {
        const { seriesId, instanceIds } = await createSeriesFixture(
          spaceId,
          customerId,
          {
            dtstart: new Date("2027-11-02T10:00:00.000Z"),
            count: 3,
            couponId: couponFixture.couponId,
          },
        );

        const afterCreateCoupon = await prisma.coupon.findUniqueOrThrow({
          where: { id: couponFixture.couponId },
          select: { usageCount: true },
        });
        expect(afterCreateCoupon.usageCount).toBe(1);

        const result = await cancelReservationSeriesCommand({
          seriesId,
          scope: "series-all",
          cancelledByType: "ADMIN",
          cancellationReason: "series 全体キャンセル",
          request: REQUEST_CONTEXT,
          now: new Date(),
        });

        expect(result.cancelledCount).toBe(3);
        expect([...result.cancelledReservationIds].sort()).toEqual(
          [...instanceIds].sort(),
        );

        const rows = await fetchReservationRows(instanceIds);
        for (const row of rows) {
          expect(row.status).toBe(ReservationStatus.CANCELLED);
        }

        const series = await prisma.reservationSeries.findUniqueOrThrow({
          where: { id: seriesId },
          select: {
            deletedAt: true,
            cancelledAt: true,
            cancelledByType: true,
            cancellationReason: true,
          },
        });
        expect(series.deletedAt).toBeInstanceOf(Date);
        expect(series.cancelledAt).toBeInstanceOf(Date);
        expect(series.cancelledByType).toBe("ADMIN");
        expect(series.cancellationReason).toBe("series 全体キャンセル");

        const afterCancelCoupon = await prisma.coupon.findUniqueOrThrow({
          where: { id: couponFixture.couponId },
          select: { usageCount: true },
        });
        expect(afterCancelCoupon.usageCount).toBe(0);
      } finally {
        await cleanup();
        await couponFixture.cleanup();
      }
    }, 30_000);

    test("this-only の instance は couponId=null のため coupon usageCount は変化しない", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      const couponFixture = await createCouponFixture();
      try {
        const { seriesId, instanceIds } = await createSeriesFixture(
          spaceId,
          customerId,
          {
            dtstart: new Date("2027-11-30T10:00:00.000Z"),
            count: 2,
            couponId: couponFixture.couponId,
          },
        );
        const target = instanceIds[0];
        if (!target) throw new Error("fixture instance missing");

        const beforeCoupon = await prisma.coupon.findUniqueOrThrow({
          where: { id: couponFixture.couponId },
          select: { usageCount: true },
        });
        expect(beforeCoupon.usageCount).toBe(1);

        await cancelReservationSeriesCommand({
          seriesId,
          scope: "this-only",
          fromInstanceId: target,
          cancelledByType: "ADMIN",
          request: REQUEST_CONTEXT,
          now: new Date(),
        });

        const afterCoupon = await prisma.coupon.findUniqueOrThrow({
          where: { id: couponFixture.couponId },
          select: { usageCount: true },
        });
        expect(afterCoupon.usageCount).toBe(1);
      } finally {
        await cleanup();
        await couponFixture.cleanup();
      }
    }, 30_000);

    test("series-all の二重実行: 2 回目は CONFLICT で reject され、coupon は二重 decrement されない", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      const couponFixture = await createCouponFixture();
      try {
        const { seriesId } = await createSeriesFixture(spaceId, customerId, {
          dtstart: new Date("2027-12-07T10:00:00.000Z"),
          count: 2,
          couponId: couponFixture.couponId,
        });

        await cancelReservationSeriesCommand({
          seriesId,
          scope: "series-all",
          cancelledByType: "ADMIN",
          request: REQUEST_CONTEXT,
          now: new Date(),
        });

        // fire-and-forget 副作用（`applyCancellationSideEffects` 内の audit log /
        // notification / smart lock 等、`fireAndForget`）は test 環境の `after()`
        // 未登録経路で detach され、await が返っても Prisma pool 接続を占有し続ける。
        // AuditLog は `AUDIT_LOG_CHAIN_LOCK` で serialize されるため 2 instance ×
        // 副作用チェーンで最大 ~500ms、pool (10) が埋まると 2 回目の `$transaction` が
        // `maxWait 2000ms` 到達で "Unable to start a transaction" と誤 reject する。
        // 本番相当の間隔（管理者の連続クリック）を模して 1s drain させる。
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // bun 1.3.14: 実 DB 統合テストで `expect(promise).rejects.*` はハングするため
        // try/catch で catch → 明示 expect で assert する
        // ([[feedback_bun-rejects-hang-and-npm-script-args]] 既知 issue)。
        let caught: unknown = null;
        try {
          await cancelReservationSeriesCommand({
            seriesId,
            scope: "series-all",
            cancelledByType: "ADMIN",
            request: REQUEST_CONTEXT,
            now: new Date(),
          });
        } catch (err) {
          caught = err;
        }
        expect(caught).toMatchObject({ code: "CONFLICT" });

        const afterCoupon = await prisma.coupon.findUniqueOrThrow({
          where: { id: couponFixture.couponId },
          select: { usageCount: true },
        });
        expect(afterCoupon.usageCount).toBe(0);
      } finally {
        await cleanup();
        await couponFixture.cleanup();
      }
    }, 30_000);
  },
);
