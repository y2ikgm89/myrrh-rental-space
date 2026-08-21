/**
 * calendar-sync-retry cron の WHERE が、既存の partial index を使うことを
 * `EXPLAIN (FORMAT JSON)` で固定する（実 Postgres 必須）。
 *
 * 索引は schema 側に既にある:
 * - `reservations_calendar_sync_error_idx` — `calendar_sync_error IS NOT NULL AND deleted_at IS NULL`
 * - `events_calendar_sync_error_idx` — 同形
 *
 * 監査 N-18 の「cron 主述語に対して Seq Scan 前提」を、planner が Index Scan /
 * Index Only Scan で当該 index を選ぶことで回帰防止する。小さな表では
 * Postgres が Seq Scan を選びがちなので、公式の
 * `SET LOCAL enable_seqscan = off` で index 検討を強制する。
 *
 * さらに planner の選択を deterministic にするため、partial index に乗らない
 * 非マッチ行を bulk insert してから `ANALYZE` を取る。空表に近い状態だと
 * `events_slug_active_key` 等の別 index + Filter と partial index のコストが
 * 僅差になり、CI で選ばれる index が揺れる（実際に Unit Tests が flake した）。
 * 非マッチ行を十分に入れると partial index 一択になり、再現性が取れる。
 *
 * SQL は Prisma findMany の WHERE と同等（物理名は `@map`）:
 * - `src/shared/domain/reservations/calendar-sync.ts` `getFailedCalendarSyncReservations`
 * - `src/shared/domain/events/calendar-sync.ts` `getFailedCalendarSyncEventIds`
 *
 * == 実行条件 ==
 * 実 Postgres を要求する。`bun run test:integration` は docker-compose の
 * test-db 既定値を注入する。直接実行で `TEST_DATABASE_URL` が未設定の場合のみ
 * describe ごと skip する（dev DB を誤って汚染しないための安全弁）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReservationStatus, TaxRateType } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type Tx = Parameters<Parameters<PrismaModule["prisma"]["$transaction"]>[0]>[0];

let prisma: PrismaModule["prisma"];

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

/** `getFailedCalendarSyncReservations` の WHERE 相当。`take: 50` 既定に合わせる。 */
const RESERVATION_RETRY_POOL_SQL = `
SELECT "id"
FROM "reservations"
WHERE "calendar_sync_error" IS NOT NULL
  AND "deleted_at" IS NULL
  AND (
    "status" IN (
      CAST('PENDING' AS "reservation_status"),
      CAST('CONFIRMED' AS "reservation_status")
    )
    OR (
      "status" = CAST('CANCELLED' AS "reservation_status")
      AND "calendar_sync_error" LIKE 'gcal_delete_failed:%'
    )
  )
LIMIT 50
`;

/** `getFailedCalendarSyncEventIds` の WHERE 相当。`take: 50` 既定に合わせる。 */
const EVENT_RETRY_POOL_SQL = `
SELECT "id"
FROM "events"
WHERE "deleted_at" IS NULL
  AND "calendar_sync_error" IS NOT NULL
LIMIT 50
`;

type ExplainRow = { "QUERY PLAN": unknown };

type PlanNode = {
  "Node Type"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
};

function parseExplainPlan(rows: ExplainRow[]): PlanNode {
  const raw = rows[0]?.["QUERY PLAN"];
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  const root = Array.isArray(parsed) ? parsed[0] : parsed;
  if (root && typeof root === "object" && "Plan" in root) {
    return (root as { Plan: PlanNode }).Plan;
  }
  throw new Error(`Unexpected EXPLAIN JSON: ${JSON.stringify(rows)}`);
}

function planUsesNamedIndexScan(node: PlanNode, indexName: string): boolean {
  const nodeType = node["Node Type"];
  if (
    (nodeType === "Index Scan" || nodeType === "Index Only Scan") &&
    node["Index Name"] === indexName
  ) {
    return true;
  }
  return (node.Plans ?? []).some((child) =>
    planUsesNamedIndexScan(child, indexName),
  );
}

async function explainRetryPool(tx: Tx, sql: string): Promise<PlanNode> {
  const rows = await tx.$queryRawUnsafe<ExplainRow[]>(
    `EXPLAIN (FORMAT JSON) ${sql}`,
  );
  return parseExplainPlan(rows);
}

function randomSortOrder(base: number): number {
  return base + Math.floor(Math.random() * 100_000_000);
}

/**
 * partial index に乗らない非マッチ行の件数。planner のコスト差を決定的に
 * 開けるための件数であり、テスト速度とのバランスで 200 に固定する。
 */
const NON_MATCHING_ROW_COUNT = 200;

describeMaybe("calendar-sync-retry cron queries use partial indexes", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("EXPLAIN が reservations / events の calendar_sync_error partial index を使う", async () => {
    const suffix = crypto.randomUUID();
    const ids: {
      locationId?: string;
      spaceId?: string;
      customerId?: string;
      categoryId?: string;
      reservationId?: string;
      eventId?: string;
    } = {};

    try {
      const location = await prisma.location.create({
        data: {
          slug: `gcal-explain-loc-${suffix}`,
          name: `GCal Explain Loc ${suffix}`,
          address: "東京都テスト区1-2-3",
          imageUrl: "https://example.com/loc.jpg",
          sortOrder: randomSortOrder(1_400_000_000),
        },
        select: { id: true },
      });
      ids.locationId = location.id;

      const space = await prisma.space.create({
        data: {
          slug: `gcal-explain-space-${suffix}`,
          name: `GCal Explain Space ${suffix}`,
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
      ids.spaceId = space.id;

      const customer = await prisma.customer.create({
        data: {
          lastName: "山田",
          firstName: "太郎",
          email: `gcal-explain-${suffix}@example.com`,
          emailCanonical: `gcal-explain-${suffix}@example.com`,
        },
        select: { id: true },
      });
      ids.customerId = customer.id;

      const category = await prisma.eventCategory.create({
        data: {
          name: `GCal Explain Category ${suffix}`,
          sortOrder: randomSortOrder(20_000_000),
        },
        select: { id: true },
      });
      ids.categoryId = category.id;

      const startTime = new Date("2027-08-20T01:00:00Z");
      const endTime = new Date("2027-08-20T02:00:00Z");

      const reservation = await prisma.reservation.create({
        data: {
          spaceId: space.id,
          customerId: customer.id,
          startTime,
          endTime,
          status: ReservationStatus.CONFIRMED,
          calendarSyncError: "update failed: 429 rate limited",
          ...DEFAULT_RESERVATION_PRICING,
        },
        select: { id: true },
      });
      ids.reservationId = reservation.id;

      const event = await prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            title: `GCal Explain Event ${suffix}`,
            slug: `gcal-explain-event-${suffix}`,
            descriptionJson: { type: "doc" },
            descriptionHtml: "<p>test</p>",
            descriptionPlainText: "test",
            scheduleMode: "SINGLE_OCCURRENCE",
            categoryId: category.id,
            calendarSyncError: "create failed: 503 backend error",
          },
          select: { id: true },
        });
        await tx.eventTimeSlot.create({
          data: {
            eventId: created.id,
            startAt: startTime,
            endAt: endTime,
            capacity: 10,
          },
        });
        return created;
      });
      ids.eventId = event.id;

      // planner のコスト見積もりを決定的にするため、partial index の述語に
      // 乗らない行（calendar_sync_error IS NULL）を両表に bulk insert する。
      // これがないと空表同然のコスト僅差で別 index（例: events_slug_active_key）
      // が選ばれ、CI が flake する。
      // reservations_no_active_time_overlap_excl（同一 space の active 予約の
      // 時間帯重複を禁じる exclusion constraint）を避けるため、dummy 各行は
      // 2 時間刻みの非重複スロットにする。
      const dummyBaseMs = Date.parse("2028-01-01T00:00:00Z");
      // 単発の implicit transaction だと adapter-pg で P2028 を踏むことがあるため、
      // seed.ts と同じく interactive transaction に載せる。
      // SINGLE_OCCURRENCE は EventTimeSlot ちょうど 1 件の CHECK があるため、
      // id をこちらで採番して slot も同時に作る。
      const dummyEvents = Array.from(
        { length: NON_MATCHING_ROW_COUNT },
        (_, i) => ({
          id: crypto.randomUUID(),
          title: `GCal Explain Dummy ${suffix} ${i}`,
          slug: `gcal-explain-dummy-${suffix}-${i}`,
          descriptionJson: { type: "doc" },
          descriptionHtml: "<p>dummy</p>",
          descriptionPlainText: "dummy",
          scheduleMode: "SINGLE_OCCURRENCE",
          categoryId: category.id,
          startAt: new Date(dummyBaseMs + i * 2 * 3_600_000),
          endAt: new Date(dummyBaseMs + (i * 2 + 1) * 3_600_000),
        }),
      );
      await prisma.$transaction(async (tx) => {
        await tx.reservation.createMany({
          data: Array.from({ length: NON_MATCHING_ROW_COUNT }, (_, i) => ({
            spaceId: space.id,
            customerId: customer.id,
            startTime: new Date(dummyBaseMs + i * 2 * 3_600_000),
            endTime: new Date(dummyBaseMs + (i * 2 + 1) * 3_600_000),
            status: ReservationStatus.CONFIRMED,
            ...DEFAULT_RESERVATION_PRICING,
          })),
        });
        await tx.event.createMany({
          data: dummyEvents.map(
            ({ startAt: _startAt, endAt: _endAt, ...e }) => e,
          ),
        });
        await tx.eventTimeSlot.createMany({
          data: dummyEvents.map((e) => ({
            eventId: e.id,
            startAt: e.startAt,
            endAt: e.endAt,
            capacity: 10,
          })),
        });
      });
      // 挿入直後の統計情報を planner に反映させる。EXPLAIN 側の transaction の
      // 外で確定させる（ANALYZE は autocommit で全 session に見える）。
      await prisma.$executeRawUnsafe('ANALYZE "reservations"');
      await prisma.$executeRawUnsafe('ANALYZE "events"');

      const { reservationPlan, eventPlan } = await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
          return {
            reservationPlan: await explainRetryPool(
              tx,
              RESERVATION_RETRY_POOL_SQL,
            ),
            eventPlan: await explainRetryPool(tx, EVENT_RETRY_POOL_SQL),
          };
        },
      );

      expect(
        planUsesNamedIndexScan(
          reservationPlan,
          "reservations_calendar_sync_error_idx",
        ),
        `reservation plan: ${JSON.stringify(reservationPlan)}`,
      ).toBe(true);
      expect(
        planUsesNamedIndexScan(eventPlan, "events_calendar_sync_error_idx"),
        `event plan: ${JSON.stringify(eventPlan)}`,
      ).toBe(true);
    } finally {
      if (ids.reservationId) {
        await prisma.reservation.deleteMany({
          where: { id: ids.reservationId },
        });
      }
      if (ids.eventId) {
        await prisma.event.deleteMany({ where: { id: ids.eventId } });
      }
      if (ids.spaceId) {
        await prisma.reservation.deleteMany({
          where: { spaceId: ids.spaceId, calendarSyncError: null },
        });
      }
      await prisma.event.deleteMany({
        where: { slug: { startsWith: `gcal-explain-dummy-${suffix}-` } },
      });
      if (ids.categoryId) {
        await prisma.eventCategory.deleteMany({
          where: { id: ids.categoryId },
        });
      }
      if (ids.customerId) {
        await prisma.customer.deleteMany({ where: { id: ids.customerId } });
      }
      if (ids.spaceId) {
        await prisma.space.deleteMany({ where: { id: ids.spaceId } });
      }
      if (ids.locationId) {
        await prisma.location.deleteMany({ where: { id: ids.locationId } });
      }
    }
  });
});
