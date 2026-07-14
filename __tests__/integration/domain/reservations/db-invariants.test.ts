/**
 * reservations の DB 不変条件を検証する統合テスト（実 DB 必須）。
 *
 * スペース予約は永続スロットではなく、`spaceId + [startTime, endTime)` の時間範囲予約を
 * 正本とする。有効予約（PENDING / CONFIRMED）の重複禁止はアプリ層の事前チェックだけでなく、
 * PostgreSQL の EXCLUDE 制約で DB 層でも強制する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe ごと skip）。gateway は
 * import 時の `process.env.DATABASE_URL` を読むため、動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReservationStatus } from "@generated/prisma/enums";
import { Client as PgClient } from "pg";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");

let basePrisma: PrismaModule["basePrisma"];

const ACTIVE_OVERLAP_CONSTRAINT = "reservations_no_active_time_overlap_excl";
const TIME_ORDER_CONSTRAINT = "reservations_time_order_check";

type Fixture = {
  spaceId: string;
  customerId: string;
  cleanup: () => Promise<void>;
};

async function createReservationFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await basePrisma.location.create({
    data: {
      slug: `reservation-invariant-loc-${suffix}`,
      name: `Reservation Invariant Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/location.jpg",
      // isActive の partial unique(sortOrder) と衝突しないよう非アクティブにする
      // (このフィクスチャは DB 制約検証専用で表示順は無関係)。
      isActive: false,
    },
    select: { id: true },
  });

  const space = await basePrisma.space.create({
    data: {
      slug: `reservation-invariant-space-${suffix}`,
      name: `Reservation Invariant Space ${suffix}`,
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

  const customer = await basePrisma.customer.create({
    data: {
      lastName: "制約",
      firstName: "太郎",
      email: `reservation-invariant-${suffix}@example.com`,
      emailCanonical: `reservation-invariant-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    cleanup: async () => {
      await basePrisma.reservation.deleteMany({
        where: { spaceId: space.id },
      });
      await basePrisma.space.deleteMany({ where: { id: space.id } });
      await basePrisma.customer.deleteMany({ where: { id: customer.id } });
      await basePrisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function createReservation(input: {
  spaceId: string;
  customerId: string;
  startTime: Date;
  endTime: Date;
  status?: ReservationStatus;
  deletedAt?: Date | null;
}) {
  const id = crypto.randomUUID();
  const client = new PgClient({ connectionString: TEST_DB_URL });
  await client.connect();
  try {
    await client.query(
      `
      INSERT INTO "reservations" (
        "id",
        "spaceId",
        "customerId",
        "startTime",
        "endTime",
        "status",
        "deletedAt",
        "paymentStatus",
        "icsSequence",
        "createdAt",
        "updatedAt",
        "basePrice",
        "totalPrice",
        "rateBreakdownJson",
        "taxRateType",
        "taxRate",
        "taxAmount",
        "totalPriceWithTax"
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6::"ReservationStatus",
        $7,
        'PENDING'::"PaymentStatus",
        0,
        now(),
        now(),
        1000,
        1000,
        '{"schemaVersion":1,"segments":[],"totalHours":0,"totalBasePrice":0,"holidayFlags":{},"legacy":true}'::jsonb,
        'standard'::"TaxRateType",
        10,
        100,
        1100
      )
    `,
      [
        id,
        input.spaceId,
        input.customerId,
        input.startTime,
        input.endTime,
        input.status ?? ReservationStatus.CONFIRMED,
        input.deletedAt ?? null,
      ],
    );
  } finally {
    await client.end();
  }
  return { id };
}

async function expectDatabaseRejects(operation: () => Promise<unknown>) {
  let rejected = false;
  try {
    await operation();
  } catch {
    rejected = true;
  }
  expect(rejected).toBe(true);
}

describeMaybe("reservations DB 不変条件", () => {
  beforeAll(async () => {
    ({ basePrisma } = await import("@/shared/db/prisma"));
    await basePrisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("時間順序 CHECK と有効予約重複 EXCLUDE 制約が DB に存在する", async () => {
    const rows = await basePrisma.$queryRaw<
      { conname: string; contype: string }[]
    >`
      SELECT conname::text AS conname, contype::text AS contype
      FROM pg_constraint
      WHERE conname IN (${TIME_ORDER_CONSTRAINT}, ${ACTIVE_OVERLAP_CONSTRAINT})
      ORDER BY conname
    `;

    expect(rows).toEqual([
      { conname: ACTIVE_OVERLAP_CONSTRAINT, contype: "x" },
      { conname: TIME_ORDER_CONSTRAINT, contype: "c" },
    ]);
  });

  test("同一スペースの有効予約は半開区間 [start, end) で重複できない", async () => {
    const fixture = await createReservationFixture();
    try {
      const start = new Date("2026-07-01T10:00:00.000Z");
      const end = new Date("2026-07-01T12:00:00.000Z");
      await createReservation({
        ...fixture,
        startTime: start,
        endTime: end,
        status: ReservationStatus.CONFIRMED,
      });

      await expectDatabaseRejects(() =>
        createReservation({
          ...fixture,
          startTime: new Date("2026-07-01T11:00:00.000Z"),
          endTime: new Date("2026-07-01T13:00:00.000Z"),
          status: ReservationStatus.PENDING,
        }),
      );
    } finally {
      await fixture.cleanup();
    }
  });

  test("隣接予約は重複扱いしない", async () => {
    const fixture = await createReservationFixture();
    try {
      await createReservation({
        ...fixture,
        startTime: new Date("2026-07-02T10:00:00.000Z"),
        endTime: new Date("2026-07-02T12:00:00.000Z"),
      });

      await expect(
        createReservation({
          ...fixture,
          startTime: new Date("2026-07-02T12:00:00.000Z"),
          endTime: new Date("2026-07-02T13:00:00.000Z"),
        }),
      ).resolves.toEqual({ id: expect.any(String) });
    } finally {
      await fixture.cleanup();
    }
  });

  test("キャンセル済みまたは削除済み予約は重複制約の対象外", async () => {
    const fixture = await createReservationFixture();
    try {
      await createReservation({
        ...fixture,
        startTime: new Date("2026-07-03T10:00:00.000Z"),
        endTime: new Date("2026-07-03T12:00:00.000Z"),
        status: ReservationStatus.CANCELLED,
      });
      await createReservation({
        ...fixture,
        startTime: new Date("2026-07-03T10:30:00.000Z"),
        endTime: new Date("2026-07-03T11:30:00.000Z"),
        status: ReservationStatus.CONFIRMED,
        deletedAt: new Date("2026-07-01T00:00:00.000Z"),
      });

      await expect(
        createReservation({
          ...fixture,
          startTime: new Date("2026-07-03T11:00:00.000Z"),
          endTime: new Date("2026-07-03T13:00:00.000Z"),
          status: ReservationStatus.CONFIRMED,
        }),
      ).resolves.toEqual({ id: expect.any(String) });
    } finally {
      await fixture.cleanup();
    }
  });

  test("startTime は endTime より前でなければならない", async () => {
    const fixture = await createReservationFixture();
    try {
      await expectDatabaseRejects(() =>
        createReservation({
          ...fixture,
          startTime: new Date("2026-07-04T12:00:00.000Z"),
          endTime: new Date("2026-07-04T12:00:00.000Z"),
        }),
      );
      await expectDatabaseRejects(() =>
        createReservation({
          ...fixture,
          startTime: new Date("2026-07-04T13:00:00.000Z"),
          endTime: new Date("2026-07-04T12:00:00.000Z"),
        }),
      );
    } finally {
      await fixture.cleanup();
    }
  });
});
