/**
 * 「同じ Space の同じ時刻を、2 つの占有が同時に持たない」を DB が本当に拒否するか。
 *
 * ## 何を占有と呼ぶか
 *
 * | 占有 | 条件 |
 * | --- | --- |
 * | Reservation | `deleted_at IS NULL` かつ status ∈ {PENDING, CONFIRMED} |
 * | EventTimeSlot | 親 Event が `deleted_at IS NULL` かつ status ∈ {DRAFT, PUBLISHED} かつ `space_id IS NOT NULL` |
 *
 * 予約 ↔ 予約 は EXCLUDE 制約が見る（`exclusion-violation-shape.test.ts`）。
 * ここが見るのは残り 2 組 — 予約 ↔ イベント枠 と、**イベント枠 ↔ イベント枠**。
 *
 * ## なぜ pg_trigger の存在確認だけでは足りないか
 *
 * 前身は `pg_trigger` に 3 本あることと DEFERRABLE であることしか見ていなかった。
 * それは trigger 関数の本体を空にしても緑のままになる検査で、守れているのは
 * 「trigger という物体があること」であって「重なりが拒否されること」ではない。
 * カタログの検査は残しつつ（DEFERRABLE は関数本体からは読めない契約なので価値がある）、
 * **通ってはいけない書込を実際に投げる**検査を主にする。
 *
 * ## 巻き戻し
 *
 * probe は 3 段で巻き戻す:
 *
 *   1. DB が拒否したらその時点で tx が abort する
 *   2. 拒否されなかったら明示的に throw して tx を巻き戻す（= その場合もコミットしない）
 *   3. probe 後に「作ろうとした行が残っていない」ことを確かめる
 *
 * CONSTRAINT TRIGGER は DEFERRABLE INITIALLY DEFERRED = COMMIT 時発火なので、
 * 巻き戻す tx の中では**そのままでは一度も発火しない**。probe は
 * `SET CONSTRAINTS ALL IMMEDIATE` を挟んで発火させる。これを忘れると
 * 「例外が出なかった」を「制約が無い」と読み違える。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");

let prisma: PrismaModule["prisma"];

type TriggerRow = {
  tgname: string;
  table_name: string;
  tgisinternal: boolean;
  tgdeferrable: boolean;
  tginitdeferred: boolean;
};

/** tgname 昇順（クエリの ORDER BY と一致させる）。 */
const EXPECTED_TRIGGER_TABLES: readonly {
  tgname: string;
  table_name: string;
}[] = [
  {
    tgname: "event_time_slots_space_is_free_check",
    table_name: "event_time_slots",
  },
  { tgname: "events_space_is_free_check", table_name: "events" },
  {
    tgname: "reservations_no_event_slot_overlap_check",
    table_name: "reservations",
  },
];

async function queryCrossTableOverlapTriggers(): Promise<TriggerRow[]> {
  return prisma.$queryRaw<TriggerRow[]>`
    SELECT
      tgname::text AS tgname,
      tgrelid::regclass::text AS table_name,
      tgisinternal,
      tgdeferrable,
      tginitdeferred
    FROM pg_trigger
    WHERE tgname IN (
      'reservations_no_event_slot_overlap_check',
      'event_time_slots_space_is_free_check',
      'events_space_is_free_check'
    )
    AND NOT tgisinternal
    ORDER BY tgname
  `;
}

/** probe が「拒否されなかった」ときに投げる番人。tx を必ず巻き戻す。 */
class NotRejected extends Error {}

type Tx = Parameters<Parameters<PrismaModule["prisma"]["$transaction"]>[0]>[0];

/**
 * probe を tx 内で流し、必ず巻き戻す。
 * DB が拒否したらそのメッセージを、拒否しなかったら null を返す。
 */
async function rejectedMessage(
  body: (tx: Tx) => Promise<void>,
): Promise<string | null> {
  try {
    await prisma.$transaction(async (tx) => {
      await body(tx);
      // ここに来た = 拒否されなかった。commit させずに抜ける。
      throw new NotRejected();
    });
  } catch (error) {
    if (error instanceof NotRejected) return null;
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

/** DEFERRED の CONSTRAINT TRIGGER を、この時点で発火させる。 */
async function fireDeferredConstraints(tx: Tx): Promise<void> {
  await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
}

// 2099 年に置く。seed や他テストが触らない時間帯を使い、
// 「たまたま空いていた」で通ることも「たまたま埋まっていた」で落ちることも避ける。
const SLOT_A_START = new Date("2099-09-01T01:00:00.000Z");
const SLOT_A_END = new Date("2099-09-01T03:00:00.000Z");
const SLOT_B_START = new Date("2099-09-01T05:00:00.000Z");
const SLOT_B_END = new Date("2099-09-01T06:00:00.000Z");
/** SLOT_A に重なる（開始時刻は違う = @@unique では拾えない）。 */
const OVERLAPPING_START = new Date("2099-09-01T02:00:00.000Z");
const OVERLAPPING_END = new Date("2099-09-01T04:00:00.000Z");
/** SLOT_A の直後に接する。半開区間なので重なりではない。 */
const ADJACENT_START = new Date("2099-09-01T03:00:00.000Z");
const ADJACENT_END = new Date("2099-09-01T04:30:00.000Z");

const EXTERNAL_FIRST_START = new Date("2099-10-01T01:00:00.000Z");
const EXTERNAL_FIRST_END = new Date("2099-10-01T03:00:00.000Z");
const EXTERNAL_SECOND_START = new Date("2099-10-01T02:00:00.000Z");
const EXTERNAL_SECOND_END = new Date("2099-10-01T04:00:00.000Z");

const RESERVED_START = new Date("2099-11-01T01:00:00.000Z");
const RESERVED_END = new Date("2099-11-01T03:00:00.000Z");

const RESERVATION_PRICING = {
  basePrice: 1000,
  totalPrice: 1000,
  rateBreakdownJson: {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
  },
  taxRateType: "STANDARD",
  taxRate: 10,
  taxAmount: 100,
  totalPriceWithTax: 1100,
} as const;

let spaceId: string;
let locationId: string;
let categoryId: string;
let customerId: string;
let hostedEventId: string;
let externalEventId: string;

describeMaybe("同一 Space の時間占有が重ならないことの DB 保証", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));

    const suffix = crypto.randomUUID();
    const location = await prisma.location.create({
      data: {
        slug: `slot-excl-loc-${suffix}`,
        name: `Slot Excl Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: 1_500_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    locationId = location.id;

    const space = await prisma.space.create({
      data: {
        slug: `slot-excl-space-${suffix}`,
        name: `Slot Excl Space ${suffix}`,
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
    spaceId = space.id;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Slot Excl Category ${suffix}`,
        sortOrder: 31_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    categoryId = category.id;

    const customer = await prisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "太郎",
        email: `slot-excl-${suffix}@example.com`,
        emailCanonical: `slot-excl-${suffix}@example.com`,
      },
      select: { id: true },
    });
    customerId = customer.id;

    // この Space を押さえている、重なり合わない 2 枠を持つイベント。
    const hosted = await prisma.$transaction(async (tx) => {
      const created = await tx.event.create({
        data: {
          title: `Slot Excl Hosted ${suffix}`,
          slug: `slot-excl-hosted-${suffix}`,
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
          status: "DRAFT",
          scheduleMode: "TIMED_ENTRY",
          categoryId,
          spaceId,
        },
        select: { id: true },
      });
      await tx.eventTimeSlot.create({
        data: {
          eventId: created.id,
          startAt: SLOT_A_START,
          endAt: SLOT_A_END,
          capacity: 5,
        },
      });
      await tx.eventTimeSlot.create({
        data: {
          eventId: created.id,
          startAt: SLOT_B_START,
          endAt: SLOT_B_END,
          capacity: 5,
        },
      });
      return created;
    });
    hostedEventId = hosted.id;

    // 同じ Space に、イベント枠とは別に予約を 1 件置く（時間帯は枠と重ならない）。
    await prisma.reservation.create({
      data: {
        spaceId,
        customerId,
        startTime: RESERVED_START,
        endTime: RESERVED_END,
        status: "CONFIRMED",
        ...RESERVATION_PRICING,
      },
    });
  });

  afterAll(async () => {
    await prisma.reservation.deleteMany({ where: { spaceId } });
    await prisma.event.deleteMany({ where: { categoryId } });
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
    // FK 安全な順序（Space→Location は Restrict）
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.location.deleteMany({ where: { id: locationId } });
    await prisma.$disconnect();
  });

  test("3 本の trigger が期待するテーブルに付いている", async () => {
    const rows = await queryCrossTableOverlapTriggers();

    expect(
      rows.map((row) => ({ tgname: row.tgname, table_name: row.table_name })),
    ).toEqual([...EXPECTED_TRIGGER_TABLES]);
  });

  test("3 本とも DEFERRABLE INITIALLY DEFERRED（枠の入れ替えを 1 tx で通すための契約）", async () => {
    const rows = await queryCrossTableOverlapTriggers();

    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.tgdeferrable).toBe(true);
      expect(row.tginitdeferred).toBe(true);
    }
  });

  test("同一イベント内で時間帯が重なる枠は拒否される（開始時刻が違うので @@unique では拾えない）", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventTimeSlot.create({
        data: {
          eventId: hostedEventId,
          startAt: OVERLAPPING_START,
          endAt: OVERLAPPING_END,
          capacity: 5,
        },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("overlaps with event slot");

    const survived = await prisma.eventTimeSlot.count({
      where: { eventId: hostedEventId, startAt: OVERLAPPING_START },
    });
    expect(survived).toBe(0);
  });

  test("別イベントが同一 Space の同じ時間帯を押さえようとしても拒否される", async () => {
    const slug = `slot-excl-rival-${crypto.randomUUID()}`;
    const message = await rejectedMessage(async (tx) => {
      const rival = await tx.event.create({
        data: {
          title: "Slot Excl Rival",
          slug,
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
          status: "PUBLISHED",
          scheduleMode: "SINGLE_OCCURRENCE",
          categoryId,
          spaceId,
        },
        select: { id: true },
      });
      await tx.eventTimeSlot.create({
        data: {
          eventId: rival.id,
          startAt: OVERLAPPING_START,
          endAt: OVERLAPPING_END,
          capacity: 5,
        },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("overlaps with event slot");

    const survived = await prisma.event.count({ where: { slug } });
    expect(survived).toBe(0);
  });

  test("既にある予約に重なる枠も拒否される（予約側の検査が消えていない）", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventTimeSlot.create({
        data: {
          eventId: hostedEventId,
          startAt: RESERVED_START,
          endAt: RESERVED_END,
          capacity: 5,
        },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("overlaps with reservation");

    const survived = await prisma.eventTimeSlot.count({
      where: { eventId: hostedEventId, startAt: RESERVED_START },
    });
    expect(survived).toBe(0);
  });

  test("隣接する枠（前の枠の終了 = 次の枠の開始）は重なりではないので通る", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventTimeSlot.create({
        data: {
          eventId: hostedEventId,
          startAt: ADJACENT_START,
          endAt: ADJACENT_END,
          capacity: 5,
        },
      });
      await fireDeferredConstraints(tx);
    });

    // 通ったうえで（= null）、巻き戻っている。
    expect(message).toBeNull();

    const survived = await prisma.eventTimeSlot.count({
      where: { eventId: hostedEventId, startAt: ADJACENT_START },
    });
    expect(survived).toBe(0);
  });

  test("外部会場（Space なし）は時間帯の重なる枠を持てる — 押さえている部屋が無いから", async () => {
    const slug = `slot-excl-external-${crypto.randomUUID()}`;
    const created = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title: "Slot Excl External",
          slug,
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
          status: "PUBLISHED",
          scheduleMode: "TIMED_ENTRY",
          categoryId,
          spaceId: null,
          addressDetail: "外部会場",
        },
        select: { id: true },
      });
      await tx.eventTimeSlot.create({
        data: {
          eventId: event.id,
          startAt: EXTERNAL_FIRST_START,
          endAt: EXTERNAL_FIRST_END,
          capacity: 5,
        },
      });
      await tx.eventTimeSlot.create({
        data: {
          eventId: event.id,
          startAt: EXTERNAL_SECOND_START,
          endAt: EXTERNAL_SECOND_END,
          capacity: 5,
        },
      });
      return event;
    });
    externalEventId = created.id;

    expect(
      await prisma.eventTimeSlot.count({ where: { eventId: externalEventId } }),
    ).toBe(2);
  });

  test("その外部会場イベントに後から Space を割り当てると、その瞬間に拒否される", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.event.update({
        where: { id: externalEventId },
        data: { spaceId },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("overlaps with event slot");

    const stillExternal = await prisma.event.findUnique({
      where: { id: externalEventId },
      select: { spaceId: true },
    });
    expect(stillExternal?.spaceId).toBeNull();
  });
});
