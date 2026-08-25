/**
 * GCal 同期の retry pool と write-back を実 DB で検証する。
 *
 * == なぜ要るのか ==
 *
 * ここは 2 つの欠陥がどちらも「where 句そのもの」にあった箇所（監査 F-61 / F-123）。
 * 既存の `__tests__/unit/lib/calendar-sync/retry-failed-syncs.test.ts` は
 * `getFailedCalendarSyncReservations` を mock 置換しているので、**where 句を
 * 一度も実行していない**。実 Postgres に行を作って読ませないと確かめられない。
 *
 * ### F-61: eventId を持つ series-child が 3 pool すべてから漏れる
 *
 * 旧実装は standalone pool の where に `seriesId: null` を要求していた。危険なのは
 * series-child に対する **create** だけ（master の RRULE 展開と時刻二重の招待に
 * なる）なのに、update / delete も一緒に落ちていた。series pool は
 * `googleCalendarEventId: null` を、master pool は `gcal_series_master_*` prefix を
 * 要求するので、eventId を持つ series-child はどこにも入らない。
 *
 * this-only キャンセルの GCal 削除が 503/429 で失敗すると、キャンセル済み予約の
 * child event が共有カレンダーに恒久的に残り、スタッフはその枠を埋まっていると
 * 誤認し続ける。`calendarSyncError` を表示する admin 画面も無いので検知経路も無い。
 *
 * ### F-123: soft-delete 済み行への write-back が P2025 で落ちる
 *
 * admin が GCal 同期済み予約を削除すると、`deletedAt` の commit が先、GCal 削除は
 * その後の `afterSuccess`。削除自体は成功するのに、直後の
 * `clearReservationCalendarEvent` が `update` + `deletedAt: null` で 0 件マッチ →
 * P2025。catch の `markReservationCalendarSyncError` も同じ述語でまた落ちるので、
 * 監査 metadata には「gcal 削除失敗」だけが残る。**主経路で毎回起きていた。**
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。where 句と `updateMany` の挙動が検証対象そのもの。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReservationStatus, TaxRateType } from "@generated/prisma/enums";

/** Reservation の必須価格列（他の integration テストと同型）。 */
const DEFAULT_RESERVATION_PRICING = {
  basePrice: 1000,
  totalPrice: 1000,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
  },
  taxRateType: TaxRateType.STANDARD,
  taxRate: 10,
  taxAmount: 100,
  totalPriceWithTax: 1100,
};

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CalendarSyncModule =
  typeof import("@/shared/domain/reservations/calendar-sync");

let prisma: PrismaModule["prisma"];
let getFailedCalendarSyncReservations: CalendarSyncModule["getFailedCalendarSyncReservations"];
let clearReservationCalendarEvent: CalendarSyncModule["clearReservationCalendarEvent"];
let markReservationCalendarSyncError: CalendarSyncModule["markReservationCalendarSyncError"];
let GCAL_DELETE_FAILED_PREFIX: CalendarSyncModule["GCAL_DELETE_FAILED_PREFIX"];

/** Location.sortOrder は unique。永続 test-db に対する再実行で衝突させない。 */
function randomSortOrder(): number {
  return Math.floor(Math.random() * 500_000_000) + 1_000_000_000;
}

type Fixture = {
  spaceId: string;
  customerId: string;
  seriesId: string;
  cleanup: () => Promise<void>;
};

let fixture: Fixture;
const createdReservationIds: string[] = [];

async function createFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `gcal-pool-loc-${suffix}`,
      name: `GCal Pool Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: randomSortOrder(),
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `gcal-pool-space-${suffix}`,
      name: `GCal Pool Space ${suffix}`,
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
      email: `gcal-pool-${suffix}@example.com`,
      emailCanonical: `gcal-pool-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const series = await prisma.reservationSeries.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      rrule: "FREQ=WEEKLY;BYDAY=FR;COUNT=2",
      dtstart: new Date("2027-03-05T01:00:00Z"),
      duration: 60,
      instanceCount: 2,
      templateData: { guestCount: 1 },
      // CHECK 制約 reservation_series_agreement_snapshot_array_check は array を要求する。
      agreementSnapshot: [],
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    seriesId: series.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({
        where: { id: { in: createdReservationIds } },
      });
      await prisma.reservationSeries.deleteMany({ where: { id: series.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

/**
 * 予約を 1 件作る。
 *
 * 開始時刻は呼び出しごとにずらす — 同じ Space の重なりは EXCLUDE 制約が拒否する。
 */
let slotOffsetHours = 0;

async function createReservation(input: {
  status: ReservationStatus;
  seriesId?: string;
  googleCalendarEventId?: string | null;
  calendarSyncError?: string | null;
  deletedAt?: Date | null;
}): Promise<string> {
  const base = new Date("2027-03-05T01:00:00Z");
  const startTime = new Date(
    base.getTime() + slotOffsetHours++ * 60 * 60 * 1000,
  );
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

  const row = await prisma.reservation.create({
    data: {
      spaceId: fixture.spaceId,
      customerId: fixture.customerId,
      startTime,
      endTime,
      status: input.status,
      ...DEFAULT_RESERVATION_PRICING,
      ...(input.seriesId !== undefined && { seriesId: input.seriesId }),
      ...(input.googleCalendarEventId !== undefined && {
        googleCalendarEventId: input.googleCalendarEventId,
      }),
      ...(input.calendarSyncError !== undefined && {
        calendarSyncError: input.calendarSyncError,
      }),
      ...(input.deletedAt !== undefined && { deletedAt: input.deletedAt }),
    },
    select: { id: true },
  });
  createdReservationIds.push(row.id);
  return row.id;
}

describeMaybe("GCal retry pool と write-back", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({
      getFailedCalendarSyncReservations,
      clearReservationCalendarEvent,
      markReservationCalendarSyncError,
      GCAL_DELETE_FAILED_PREFIX,
    } = await import("@/shared/domain/reservations/calendar-sync"));
    fixture = await createFixture();
  });

  afterAll(async () => {
    await fixture.cleanup();
    await prisma.$disconnect();
  });

  test("eventId を持つ series-child の delete 失敗は pool に入る（F-61）", async () => {
    const id = await createReservation({
      status: ReservationStatus.CANCELLED,
      seriesId: fixture.seriesId,
      googleCalendarEventId: "gcal-master_20270305T010000Z",
      calendarSyncError: `${GCAL_DELETE_FAILED_PREFIX} 503 backend error`,
    });

    const pool = await getFailedCalendarSyncReservations();
    const row = pool.find((r) => r.id === id);

    expect(row).toBeDefined();
    // 呼び出し側が create / update / delete を振り分けるのに使う。
    expect(row?.seriesId).toBe(fixture.seriesId);
    expect(row?.googleCalendarEventId).toBe("gcal-master_20270305T010000Z");
  });

  test("eventId を持つ series-child の update 失敗も pool に入る（F-61）", async () => {
    const id = await createReservation({
      status: ReservationStatus.CONFIRMED,
      seriesId: fixture.seriesId,
      googleCalendarEventId: "gcal-master_20270312T010000Z",
      calendarSyncError: "update failed: 429 rate limited",
    });

    const pool = await getFailedCalendarSyncReservations();

    expect(pool.map((r) => r.id)).toContain(id);
  });

  test("eventId 未発行の series-child も pool には入る（除外は呼び出し側）", async () => {
    // where 句を広げたので行自体は返る。standalone create を回さない判定は
    // `retryFailedStandaloneCalendarSyncs` の 1 箇所に置いてある（GCAL-RETRY-07）。
    const id = await createReservation({
      status: ReservationStatus.CONFIRMED,
      seriesId: fixture.seriesId,
      googleCalendarEventId: null,
      calendarSyncError: "create failed: quota exceeded",
    });

    const pool = await getFailedCalendarSyncReservations();
    const row = pool.find((r) => r.id === id);

    expect(row).toBeDefined();
    expect(row?.googleCalendarEventId).toBeNull();
    expect(row?.seriesId).toBe(fixture.seriesId);
  });

  test("soft-delete 済み行は pool に入らない", async () => {
    const id = await createReservation({
      status: ReservationStatus.CONFIRMED,
      calendarSyncError: "create failed: quota exceeded",
      deletedAt: new Date(),
    });

    const pool = await getFailedCalendarSyncReservations();

    expect(pool.map((r) => r.id)).not.toContain(id);
  });

  test("soft-delete 済み行でも eventId をクリアできる（F-123）", async () => {
    const id = await createReservation({
      status: ReservationStatus.CANCELLED,
      googleCalendarEventId: "gcal-standalone-deleted",
      calendarSyncError: `${GCAL_DELETE_FAILED_PREFIX} 503`,
      deletedAt: new Date(),
    });

    // 旧実装（`update` + `deletedAt: null`）はここで P2025 を throw し、
    // 成功した GCal 削除が「失敗」として監査 metadata に残っていた。
    await clearReservationCalendarEvent(id);

    const after = await prisma.reservation.findUnique({
      where: { id },
      select: { googleCalendarEventId: true, calendarSyncError: true },
    });
    expect(after?.googleCalendarEventId).toBeNull();
    expect(after?.calendarSyncError).toBeNull();
  });

  test("soft-delete 済み行にも同期エラーを記録できる（F-123）", async () => {
    const id = await createReservation({
      status: ReservationStatus.CANCELLED,
      googleCalendarEventId: "gcal-standalone-deleted-2",
      deletedAt: new Date(),
    });

    await markReservationCalendarSyncError({
      reservationId: id,
      error: `${GCAL_DELETE_FAILED_PREFIX} 500`,
    });

    const after = await prisma.reservation.findUnique({
      where: { id },
      select: { calendarSyncError: true },
    });
    expect(after?.calendarSyncError).toBe(`${GCAL_DELETE_FAILED_PREFIX} 500`);
  });

  /**
   * retry pool は「最後に触ってから一番長い行」から回す（監査 A-34）。
   *
   * 旧実装は `take: limit` だけで `orderBy` が無く、どの行が選ばれるかは
   * 実行計画と heap / index の物理順に依存していた。恒久失敗する行が
   * 上限を埋める限り、新しく失敗した行は一度も再試行されないまま滋留する。
   *
   * `updatedAt` は `@updatedAt` なので Prisma の update では固定できない。
   * 順序を見るのが目的なので raw SQL で遾らせる。
   */
  test("同期失敗行は updatedAt の昇順で返る", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(
        await createReservation({
          status: ReservationStatus.CONFIRMED,
          calendarSyncError: `fairness probe ${i}`,
        }),
      );
    }

    // プール内の他の行より確実に古くし、同時に 3 行の先後を固定する。
    // 昇順の期待は ids[2] → ids[1] → ids[0]。
    for (const [offset, id] of ids.entries()) {
      const stamp = new Date(Date.UTC(2000, 0, 1 + (2 - offset)));
      await prisma.$executeRaw`UPDATE reservations SET updated_at = ${stamp} WHERE id = ${id}::uuid`;
    }

    const rows = await getFailedCalendarSyncReservations(3);

    expect(rows.map((row) => row.id)).toEqual([...ids].reverse());
  });

  test("存在しない id を渡しても throw しない", async () => {
    // `updateMany` は 0 件マッチでも例外を出さない。これが F-123 の修正点。
    await clearReservationCalendarEvent(crypto.randomUUID());
  });
});
