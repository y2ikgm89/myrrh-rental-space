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
ORDER BY "id"
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
