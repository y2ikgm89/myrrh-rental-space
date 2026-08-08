/**
 * E2E fixture が書く行が DB の CHECK 制約と噛み合うことを、**実 DB に流して**確かめる。
 *
 * ## なぜ静的 gate ではないのか
 *
 * `reservation_series.agreement_snapshot` には
 * `jsonb_typeof(agreement_snapshot) = 'array'` の CHECK がある。WP18-23 でこれが
 * 入ったとき、E2E fixture 側は `{ agreements: [] }` というオブジェクトを書いたままで、
 * **nightly が 7 連続で赤になるまで誰も気付かなかった**（2026-08-01〜08-07）。
 * 静的 gate は「fixture がどんな JSON を書くか」を型でも正規表現でも保証できない。
 * 制約の当たり判定は Postgres が持っているので、Postgres に判定させる。
 *
 * これで同じ drift は **PR 時点の `test:integration`** で落ちる（nightly を待たない）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe.skip）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { buildReservationSeriesFixtureData } from "../../../e2e/helpers/reservation-series-fixture";
import { definite } from "../../support/definite";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
let prisma: PrismaModule["prisma"];

const SLUG = "int-reservation-series-fixture-shape";
const EMAIL = `${SLUG}@example.com`;

const START_TIMES = [
  new Date("2029-02-06T01:00:00.000Z"),
  new Date("2029-02-13T01:00:00.000Z"),
  new Date("2029-02-20T01:00:00.000Z"),
] as const;

const SPEC = {
  spaceSlug: SLUG,
  rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
  startTimes: START_TIMES,
  durationMinutes: 120,
  totalPrice: 5000,
  taxRate: 10,
  notePrefix: "[INT] reservation series fixture shape",
} as const;

let spaceId = "";
let customerId = "";
let locationId = "";

async function purge(): Promise<void> {
  const spaces = await prisma.space.findMany({
    where: { slug: SLUG },
    select: { id: true },
  });
  const spaceIds = spaces.map((space) => space.id);
  if (spaceIds.length > 0) {
    await prisma.reservation.deleteMany({
      where: { spaceId: { in: spaceIds } },
    });
    await prisma.reservationSeries.deleteMany({
      where: { spaceId: { in: spaceIds } },
    });
    await prisma.space.deleteMany({ where: { id: { in: spaceIds } } });
  }
  await prisma.customer.deleteMany({ where: { email: EMAIL } });
  await prisma.location.deleteMany({ where: { slug: SLUG } });
}

describeMaybe("E2E fixture の ReservationSeries payload", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    await purge();

    const maxSortOrder = await prisma.location.aggregate({
      _max: { sortOrder: true },
    });
    const location = await prisma.location.create({
      data: {
        slug: SLUG,
        name: "[INT] fixture shape 検証用拠点",
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/location.jpg",
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
      select: { id: true },
    });
    locationId = location.id;

    const space = await prisma.space.create({
      data: {
        slug: SLUG,
        name: "[INT] fixture shape 検証用スペース",
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>int</p>",
        descriptionPlainText: "int",
        capacity: 10,
        hourlyPrice: 2500,
        mainImageUrl: "https://example.com/space.jpg",
        locationId,
      },
      select: { id: true },
    });
    spaceId = space.id;

    const customer = await prisma.customer.create({
      data: {
        email: EMAIL,
        emailCanonical: EMAIL,
        lastName: "検証",
        firstName: "太郎",
      },
      select: { id: true },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await purge();
    await prisma.$disconnect();
  });

  test("CHECK 制約が実 DB に存在する（この検証が空振りしていないこと）", async () => {
    // オブジェクト形を入れて**拒否されること**を先に確かめる。これが通ってしまう
    // 環境では以下の assertion は何も証明しない。
    // `expect(promise).rejects` は実 DB 相手だと bun 1.3.14 でハングするので try/catch。
    let rejected = false;
    try {
      await prisma.reservationSeries.create({
        data: {
          spaceId,
          customerId,
          rrule: SPEC.rrule,
          dtstart: definite(START_TIMES[0], "START_TIMES[0]"),
          duration: SPEC.durationMinutes,
          instanceCount: START_TIMES.length,
          templateData: {},
          // WP18-23 以前の fixture が書いていた形（オブジェクト）
          agreementSnapshot: { agreements: [] },
        },
        select: { id: true },
      });
    } catch (error) {
      rejected = true;
      expect(String(error)).toContain(
        "reservation_series_agreement_snapshot_array_check",
      );
    }
    expect(rejected).toBe(true);
  });

  test("UNPAID の payload が series + instance を作れる", async () => {
    const data = buildReservationSeriesFixtureData({
      ...SPEC,
      spaceId,
      customerId,
      payment: { kind: "UNPAID" },
    });

    const series = await prisma.reservationSeries.create({
      data: data.series,
      select: { id: true },
    });
    await prisma.reservation.createMany({
      data: data.instances.map((instance) => ({
        ...instance,
        seriesId: series.id,
      })),
    });

    const shape = await prisma.$queryRaw<{ kind: string }[]>`
      SELECT jsonb_typeof(agreement_snapshot) AS kind
      FROM reservation_series WHERE id = ${series.id}::uuid
    `;
    expect(definite(shape[0], "agreement_snapshot の形状").kind).toBe("array");

    const instances = await prisma.reservation.count({
      where: { seriesId: series.id },
    });
    expect(instances).toBe(START_TIMES.length);

    await prisma.reservation.deleteMany({ where: { seriesId: series.id } });
    await prisma.reservationSeries.delete({ where: { id: series.id } });
  });

  test("PAID の payload が series + instance を作れる", async () => {
    const data = buildReservationSeriesFixtureData({
      ...SPEC,
      spaceId,
      customerId,
      payment: {
        kind: "PAID",
        paymentIntentPrefix: "pi_int_fixture_shape_",
        paidAt: new Date("2029-01-01T00:00:00.000Z"),
      },
    });

    const series = await prisma.reservationSeries.create({
      data: data.series,
      select: { id: true },
    });
    await prisma.reservation.createMany({
      data: data.instances.map((instance) => ({
        ...instance,
        seriesId: series.id,
      })),
    });

    const paid = await prisma.reservation.findMany({
      where: { seriesId: series.id },
      orderBy: { startTime: "asc" },
      select: { paymentStatus: true, stripePaymentIntentId: true },
    });
    expect(paid.map((row) => row.paymentStatus)).toEqual([
      "PAID",
      "PAID",
      "PAID",
    ]);
    expect(new Set(paid.map((row) => row.stripePaymentIntentId)).size).toBe(3);

    await prisma.reservation.deleteMany({ where: { seriesId: series.id } });
    await prisma.reservationSeries.delete({ where: { id: series.id } });
  });
});
