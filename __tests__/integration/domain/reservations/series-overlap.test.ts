/**
 * `createReservationSeriesCommand` の実 DB 統合テスト（Phase B.2 task 13）。
 *
 * 検証する 3 つの不変条件（すべて mock では再現不能、実 Postgres が必須）:
 *
 *   1. アプリ層 pre-check（`checkReservationOverlapQuery` を各 instance に対して
 *      逐次実行）が、既存の（series 外の）予約と重複する instance を「N 回目 (日付)」
 *      の specific error で検出し、series/instance を一切作成せず tx 全体を
 *      rollback する（spec risk-1 対策）。
 *   2. `reservations_no_active_time_overlap_excl` EXCLUDE 制約が、pre-check では
 *      原理的に検出できないケース（**同一 createMany バッチ内**で instance 同士が
 *      重複するケース — pre-check は「既存 DB 行」としか比較しないため、まだ
 *      insert していない同バッチの兄弟 instance とは比較できない）を defense-in-depth
 *      として検出し、`createMany` ごと reject する。
 *   3. `reservations_no_event_slot_overlap_check` CONSTRAINT TRIGGER（Event ↔
 *      Reservation cross-table overlap、PR#5 既存）が、pre-check の対象外
 *      （`checkReservationOverlapQuery` は Reservation 同士の重複のみ検査し
 *      EventTimeSlot は見ない）である EventTimeSlot との重複を検出する。
 *   4. advisory lock 728357（series 単位）+ 728351（Space 単位、既存契約）が、
 *      同一 space への 2 並行 series 作成を直列化する（先着 1 件のみ成功）。
 *
 * `lockReservationSeriesForTransaction` (728357) 自体の直列化検証は
 * `series-advisory-lock.test.ts`（Task 9）が担当済みのため、本ファイルの (4) は
 * 「`createReservationSeriesCommand` 経由でも同じ直列化が効く」ことのみを確認する
 * （space-overlap-concurrency.test.ts と同型の end-to-end 並行性検証）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe ごと skip）。gateway は
 * import 時の `process.env.DATABASE_URL` を読むため、動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventStatus, TaxRateType } from "@generated/prisma/enums";

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

type SpaceFixture = {
  spaceId: string;
  customerId: string;
  cleanup: () => Promise<void>;
};

// Location.sortOrder は unique 制約。同一の永続 test-db に対して本ファイルを 2 回以上
// 実行するとカウンター方式（e.g. `let counter = 1_300_000_000; sortOrder: counter++`）
// では前回残骸との collision が起きる（claim-commands.test.ts 同型 fix、Postgres int32
// 有符号範囲内の 1.5B〜2.0B に収める）。
function randomSortOrder(): number {
  return Math.floor(Math.random() * 500_000_000) + 1_500_000_000;
}

/** Location → Space → Customer を 1 件ずつ作る最小 fixture（space-overlap-concurrency と同型）。 */
async function createSpaceFixture(): Promise<SpaceFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `series-overlap-loc-${suffix}`,
      name: `Series Overlap Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: randomSortOrder(),
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `series-overlap-space-${suffix}`,
      name: `Series Overlap Space ${suffix}`,
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
      email: `series-overlap-${suffix}@example.com`,
      emailCanonical: `series-overlap-${suffix}@example.com`,
    },
    select: { id: true },
  });

  return {
    spaceId: space.id,
    customerId: customer.id,
    cleanup: async () => {
      // brief 記載の cleanup 順序（registration-overbooking.test.ts の
      // EventRegistration → EventTicket → Event 型を Reservation 側に適用）:
      // Reservation → Coupon → ReservationSeries → Space → Customer → Location
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

/** Settings singleton の maxRecurrenceInstances を安全な既定値へ upsert する。 */
async function ensureSettings(maxRecurrenceInstances = 26): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", maxRecurrenceInstances },
    update: { maxRecurrenceInstances },
  });
}

describeMaybe(
  "createReservationSeriesCommand — overlap / advisory lock (integration)",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ createReservationSeriesCommand } =
        await import("@/shared/domain/reservations/series-commands"));
      // 接続プールをウォームアップ（コールドスタートが並行クエリをずらして race を隠すのを防ぐ）。
      await prisma.$queryRaw`SELECT 1`;
      await ensureSettings(26);
    });

    afterAll(async () => {
      await basePrisma.$disconnect();
    });

    test("既存予約と重複する 2 回目の instance は「2 回目 (日付)」の CONFLICT で reject され、series/instance は 1 件も作成されない", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      try {
        // WEEKLY 火曜 3 回、dtstart は 2027-05-04 (火) 10:00 UTC。
        const dtstart = new Date("2027-05-04T10:00:00.000Z");
        // 2 回目 (2027-05-11 10:00-12:00) と完全に重なる既存予約を先に作る。
        await prisma.reservation.create({
          data: {
            spaceId,
            customerId,
            startTime: new Date("2027-05-11T10:00:00.000Z"),
            endTime: new Date("2027-05-11T12:00:00.000Z"),
            status: "CONFIRMED",
            ...TEMPLATE_DATA,
          },
        });

        // bun 1.3.14: 実 DB 統合テストで `expect(promise).rejects.*` はハングするため
        // try/catch で catch → 明示 expect で assert する
        // ([[feedback_bun-rejects-hang-and-npm-script-args]] 既知 issue)。
        let caught: unknown = null;
        try {
          await createReservationSeriesCommand({
            spaceId,
            customerId,
            rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
            dtstart,
            duration: 120,
            templateData: TEMPLATE_DATA,
            agreements: [],
            now: new Date(),
          });
        } catch (err) {
          caught = err;
        }
        expect(caught).toMatchObject({
          code: "CONFLICT",
          message: expect.stringContaining("2 回目 (2027-05-11)"),
        });

        const seriesCount = await prisma.reservationSeries.count({
          where: { spaceId },
        });
        expect(seriesCount).toBe(0);
        // 既存の 1 件だけが残り、series の instance は作られていない。
        const reservationCount = await prisma.reservation.count({
          where: { spaceId },
        });
        expect(reservationCount).toBe(1);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("EXCLUDE 制約: 同一 createMany バッチ内で instance 同士が重複する場合（pre-check では検出不能）は reject され、rollback される", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      try {
        // DAILY 3 回・duration=1500分(25h) → 隣接 instance が [Day N 10:00, Day N+1 11:00)
        // となり、Day N+1 の 10:00-11:00 が翌 instance と重なる。pre-check（各 instance を
        // 既存 DB 行とだけ比較）はまだ insert していない兄弟 instance を見られないため
        // ここを通過し、createMany が初めて EXCLUDE 制約に当たる。
        const dtstart = new Date("2027-06-01T10:00:00.000Z");

        // bun 1.3.14: `expect(promise).rejects` ハング回避のため try/catch。
        let caught: unknown = null;
        try {
          await createReservationSeriesCommand({
            spaceId,
            customerId,
            rrule: "FREQ=DAILY;COUNT=3",
            dtstart,
            duration: 1500,
            templateData: TEMPLATE_DATA,
            agreements: [],
            now: new Date(),
          });
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toMatch(
          /exclusion constraint|reservations_no_active_time_overlap_excl/,
        );

        const seriesCount = await prisma.reservationSeries.count({
          where: { spaceId },
        });
        expect(seriesCount).toBe(0);
        const reservationCount = await prisma.reservation.count({
          where: { spaceId },
        });
        expect(reservationCount).toBe(0);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("CROSS-TABLE TRIGGER: pre-check の対象外である EventTimeSlot との重複は createMany 時に検出され、series/instance は作成されない", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      let eventId: string | null = null;
      try {
        // WEEKLY 火曜 2 回。2 回目 (2027-07-13 10:00-12:00) の時間帯に、同じ space の
        // Event + EventTimeSlot を先に作っておく（Reservation 同士ではないため
        // checkReservationOverlapQuery の pre-check は検出しない）。
        const dtstart = new Date("2027-07-06T10:00:00.000Z");
        const conflictStart = new Date("2027-07-13T10:30:00.000Z");
        const conflictEnd = new Date("2027-07-13T11:30:00.000Z");

        const event = await prisma.$transaction(async (tx) => {
          const created = await tx.event.create({
            data: {
              title: "Series Overlap Trigger Test Event",
              slug: `series-overlap-trigger-${crypto.randomUUID()}`,
              descriptionJson: { type: "doc" },
              descriptionHtml: "<p>test</p>",
              descriptionPlainText: "test",
              status: EventStatus.PUBLISHED,
              scheduleMode: "SINGLE_OCCURRENCE",
              registrationOpen: true,
              spaceId,
              firstSlotStartAt: conflictStart,
              lastSlotEndAt: conflictEnd,
            },
            select: { id: true },
          });
          await tx.eventTimeSlot.create({
            data: {
              eventId: created.id,
              startAt: conflictStart,
              endAt: conflictEnd,
              capacity: 10,
            },
            select: { id: true },
          });
          return created;
        });
        eventId = event.id;

        // bun 1.3.14: `expect(promise).rejects` ハング回避のため try/catch。
        let caught: unknown = null;
        try {
          await createReservationSeriesCommand({
            spaceId,
            customerId,
            rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=2",
            dtstart,
            duration: 120,
            templateData: TEMPLATE_DATA,
            agreements: [],
            now: new Date(),
          });
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toMatch(
          /overlaps with EventTimeSlot/,
        );

        const seriesCount = await prisma.reservationSeries.count({
          where: { spaceId },
        });
        expect(seriesCount).toBe(0);
        const reservationCount = await prisma.reservation.count({
          where: { spaceId },
        });
        expect(reservationCount).toBe(0);
      } finally {
        if (eventId) {
          // event + slot は同一 tx で削除する（SINGLE_OCCURRENCE の deferred constraint
          // が「slot 削除後・event 削除前」の中間状態で slot_count=0 を検出するため）。
          // `let` 変数はネストした async closure 内で自動narrowingされないため、
          // ローカル const に確定させてから渡す。
          const confirmedEventId = eventId;
          await prisma.$transaction(async (tx) => {
            await tx.eventTimeSlot.deleteMany({
              where: { eventId: confirmedEventId },
            });
            await tx.event.deleteMany({ where: { id: confirmedEventId } });
          });
        }
        await cleanup();
      }
    }, 30_000);

    test("advisory lock 728357: 同一 space への 2 並行 series 作成は直列化され、1 件のみ成功する", async () => {
      const { spaceId, customerId, cleanup } = await createSpaceFixture();
      try {
        const dtstart = new Date("2027-08-03T10:00:00.000Z");
        const buildInput = () => ({
          spaceId,
          customerId,
          rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
          dtstart,
          duration: 120,
          templateData: TEMPLATE_DATA,
          agreements: [],
          now: new Date(),
        });

        const results = await Promise.allSettled([
          createReservationSeriesCommand(buildInput()),
          createReservationSeriesCommand(buildInput()),
        ]);

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );

        // 直列化の結果、後発は必ず「既存 instance と重複」の CONFLICT で敗退する
        // （advisory lock により先発の commit 後にしか overlap pre-check を実行できない）。
        expect(fulfilled.length).toBe(1);
        expect(rejected.length).toBe(1);
        expect(rejected[0]?.reason).toMatchObject({ code: "CONFLICT" });

        const seriesCount = await prisma.reservationSeries.count({
          where: { spaceId },
        });
        expect(seriesCount).toBe(1);
        const reservationCount = await prisma.reservation.count({
          where: { spaceId },
        });
        expect(reservationCount).toBe(3);
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
