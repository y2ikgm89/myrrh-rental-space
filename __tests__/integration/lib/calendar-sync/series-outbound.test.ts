/**
 * ReservationSeries → Google Calendar 同期の実 DB 統合テスト（Phase B.2 task 16）。
 *
 * `@/shared/lib/google-calendar` の client 境界のみ mock し、
 * `calendar-sync/outbound.ts` (SUT) + 実 DB は本物で回す。検証する契約:
 *
 *   1. `createCalendarEvent` に `recurrence: ["RRULE:${series.rrule}"]` が渡される
 *      (Google Calendar API 契約、prefix 込みの完全形)。
 *   2. `fetchEventInstances(masterEventId)` が返した child eventId を
 *      各 Reservation.googleCalendarEventId に write-back する
 *      (startTime 完全一致で結び付け)。
 *   3. GCal 無効時は no-op success (`isGoogleCalendarEnabled: false` → early return)。
 *
 * fixture は `prisma.reservationSeries.create()` + `prisma.reservation.createMany()`
 * を直接呼ぶ (`createReservationSeriesCommand` に依存しないことで PR 3 未 merge の
 * 状態でも本 PR の verify が独立に走れる)。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行 (`SERIAL_DB_TESTS` に登録済)。
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import type { calendar_v3 } from "googleapis";

import type {
  CalendarEventInstance,
  CalendarEventParams,
} from "@/shared/lib/google-calendar/types";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// -----------------------------------------------------------------------------
// Mocks: google-calendar boundary
// -----------------------------------------------------------------------------

type MockCreateResult = {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  event?: calendar_v3.Schema$Event;
  error?: string;
};

type MockFetchInstancesResult = {
  success: boolean;
  instances?: CalendarEventInstance[];
  error?: string;
};

const mockIsEnabled = mock<() => Promise<boolean>>(() => Promise.resolve(true));
const mockCreate = mock<
  (
    params: CalendarEventParams,
    options?: { withMeet?: boolean },
  ) => Promise<MockCreateResult>
>(() => Promise.resolve({ success: true, eventId: "master-default" }));
const mockFetchInstances = mock<
  (masterId: string) => Promise<MockFetchInstancesResult>
>(() => Promise.resolve({ success: true, instances: [] }));

mock.module("@/shared/lib/google-calendar", () => ({
  isGoogleCalendarEnabled: mockIsEnabled,
  createCalendarEvent: mockCreate,
  fetchEventInstances: mockFetchInstances,
  // outbound.ts が barrel から import する残りの export は本テストで未使用、
  // モジュール全体差し替えのため無害スタブを置く。
  updateCalendarEvent: mock(() => Promise.resolve({ success: true })),
  deleteCalendarEvent: mock(() => Promise.resolve({ success: true })),
  getCalendarEvent: mock(() => Promise.resolve({ success: false })),
  getServiceAccountClient: mock(() => Promise.resolve(null)),
  encryptServiceAccountJson: mock(() => ""),
  extractServiceAccountEmail: mock(() => null),
  fetchCalendarChanges: mock(() => Promise.resolve({ items: [] })),
  setupWebhookWatch: mock(() => Promise.resolve({ success: false })),
  stopWebhookWatch: mock(() => Promise.resolve()),
  renewWebhookIfNeeded: mock(() => Promise.resolve({ renewed: false })),
  testServiceAccountConnection: mock(() => Promise.resolve({ success: false })),
  isTwoWaySyncEnabled: mock(() => Promise.resolve(false)),
  isValidCalendarId: mock(() => false),
  formatGoogleApiError: mock((e: unknown) => String(e)),
}));

// -----------------------------------------------------------------------------
// Dynamic imports (mock.module 後)
// -----------------------------------------------------------------------------

type PrismaModule = typeof import("@/shared/db/prisma");
type OutboundModule = typeof import("@/shared/lib/calendar-sync/outbound");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let syncReservationSeriesToCalendar: OutboundModule["syncReservationSeriesToCalendar"];
let writeBackInstanceGoogleCalendarEventIds: OutboundModule["writeBackInstanceGoogleCalendarEventIds"];

// -----------------------------------------------------------------------------
// Fixture: series + N instances (createReservationSeriesCommand に依存しない)
// -----------------------------------------------------------------------------

function randomSortOrder(): number {
  return Math.floor(Math.random() * 500_000_000) + 1_500_000_000;
}

type SeriesFixture = {
  seriesId: string;
  spaceId: string;
  instances: { id: string; startTime: Date }[];
  cleanup: () => Promise<void>;
};

async function createSeriesFixture(): Promise<SeriesFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `series-outbound-loc-${suffix}`,
      name: `Series Outbound Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: randomSortOrder(),
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `series-outbound-space-${suffix}`,
      name: `Series Outbound Space ${suffix}`,
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
      firstName: "花子",
      email: `series-outbound-${suffix}@example.com`,
      emailCanonical: `series-outbound-${suffix}@example.com`,
    },
    select: { id: true, email: true },
  });

  // 3 instance series (WEEKLY TU count=3)
  const dtstart = new Date("2028-01-04T10:00:00.000Z"); // 2028-01-04 = Tuesday
  const series = await prisma.reservationSeries.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
      dtstart,
      duration: 120,
      instanceCount: 3,
      templateData: {},
      agreementSnapshot: [],
    },
    select: { id: true },
  });

  const startTimes = [
    new Date("2028-01-04T10:00:00.000Z"),
    new Date("2028-01-11T10:00:00.000Z"),
    new Date("2028-01-18T10:00:00.000Z"),
  ];

  await prisma.reservation.createMany({
    data: startTimes.map((startTime, index) => ({
      spaceId: space.id,
      customerId: customer.id,
      seriesId: series.id,
      recurrenceInstanceIndex: index,
      startTime,
      endTime: new Date(startTime.getTime() + 120 * 60_000),
      status: "CONFIRMED",
      totalPrice: 5000,
      basePrice: 5000,
      rateBreakdownJson: { legacy: true, segments: [] },
      taxRateType: "standard",
      taxRate: 10,
      taxAmount: 500,
      totalPriceWithTax: 5500,
    })),
  });

  const instances = await prisma.reservation.findMany({
    where: { seriesId: series.id },
    select: { id: true, startTime: true },
    orderBy: { startTime: "asc" },
  });

  return {
    seriesId: series.id,
    spaceId: space.id,
    instances,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { spaceId: space.id } });
      await prisma.reservationSeries.deleteMany({
        where: { id: series.id },
      });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describeMaybe(
  "syncReservationSeriesToCalendar — GCal recurring master + writeBack (integration)",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({
        syncReservationSeriesToCalendar,
        writeBackInstanceGoogleCalendarEventIds,
      } = await import("@/shared/lib/calendar-sync/outbound"));
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await basePrisma.$disconnect();
    });

    afterEach(() => {
      mockIsEnabled.mockClear();
      mockIsEnabled.mockImplementation(() => Promise.resolve(true));
      mockCreate.mockClear();
      mockCreate.mockImplementation(() =>
        Promise.resolve({ success: true, eventId: "master-default" }),
      );
      mockFetchInstances.mockClear();
      mockFetchInstances.mockImplementation(() =>
        Promise.resolve({ success: true, instances: [] }),
      );
    });

    test("recurrence 付き createCalendarEvent 呼出 → child eventId が各 Reservation に write-back される", async () => {
      const fixture = await createSeriesFixture();
      try {
        mockCreate.mockImplementation(() =>
          Promise.resolve({ success: true, eventId: "master-abc" }),
        );
        mockFetchInstances.mockImplementation(() =>
          Promise.resolve({
            success: true,
            instances: fixture.instances.map((r) => ({
              id: `master-abc_${r.startTime
                .toISOString()
                .replace(/[-:]/g, "")
                .replace(/\.\d{3}/, "")}`,
              startTime: r.startTime,
            })),
          }),
        );

        const result = await syncReservationSeriesToCalendar(fixture.seriesId);

        expect(result.success).toBe(true);
        expect(result.eventId).toBe("master-abc");

        // createCalendarEvent 呼出時の param 検証
        expect(mockCreate).toHaveBeenCalledTimes(1);
        const [callParams] = mockCreate.mock.calls[0] ?? [];
        expect(callParams?.recurrence).toEqual([
          "RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3",
        ]);
        expect(callParams?.startTime).toEqual(
          new Date("2028-01-04T10:00:00.000Z"),
        );

        // fetchEventInstances 呼出
        expect(mockFetchInstances).toHaveBeenCalledTimes(1);
        expect(mockFetchInstances.mock.calls[0]?.[0]).toBe("master-abc");

        // 各 Reservation.googleCalendarEventId が child ID になっているか
        const updated = await prisma.reservation.findMany({
          where: { seriesId: fixture.seriesId },
          select: {
            id: true,
            startTime: true,
            googleCalendarEventId: true,
          },
          orderBy: { startTime: "asc" },
        });
        expect(updated).toHaveLength(3);
        for (const r of updated) {
          expect(r.googleCalendarEventId).toMatch(/^master-abc_/);
        }
      } finally {
        await fixture.cleanup();
      }
    }, 30_000);

    test("isGoogleCalendarEnabled=false なら no-op success (createCalendarEvent 未呼出)", async () => {
      const fixture = await createSeriesFixture();
      try {
        mockIsEnabled.mockImplementation(() => Promise.resolve(false));

        const result = await syncReservationSeriesToCalendar(fixture.seriesId);

        expect(result.success).toBe(true);
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockFetchInstances).not.toHaveBeenCalled();
      } finally {
        await fixture.cleanup();
      }
    }, 30_000);

    test("series が見つからなければ success:false + 明示エラー", async () => {
      // 存在しない seriesId (UUID 形式) を渡す
      const bogusId = "00000000-0000-0000-0000-000000000000";
      const result = await syncReservationSeriesToCalendar(bogusId);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(mockCreate).not.toHaveBeenCalled();
    }, 30_000);

    test("writeBackInstanceGoogleCalendarEventIds: startTime 一致で write-back、不一致 skip", async () => {
      const fixture = await createSeriesFixture();
      try {
        // 3 instance のうち 2 件のみ GCal instance が返る (1 件は startTime ずらす)
        const gcalInstances = [
          {
            id: "master-xyz_20280104T100000Z",
            startTime: fixture.instances[0]!.startTime,
          },
          {
            id: "master-xyz_20280111T100000Z",
            startTime: fixture.instances[1]!.startTime,
          },
          // 3 件目は startTime を 1 分ずらして一致しない状態にする
          {
            id: "master-xyz_ORPHAN",
            startTime: new Date("2028-01-18T10:01:00.000Z"),
          },
        ];

        const result = await writeBackInstanceGoogleCalendarEventIds({
          seriesId: fixture.seriesId,
          instances: gcalInstances,
        });
        expect(result.matched).toBe(2);
        expect(result.total).toBe(3);

        const updated = await prisma.reservation.findMany({
          where: { seriesId: fixture.seriesId },
          select: {
            id: true,
            startTime: true,
            googleCalendarEventId: true,
          },
          orderBy: { startTime: "asc" },
        });
        expect(updated[0]?.googleCalendarEventId).toBe(
          "master-xyz_20280104T100000Z",
        );
        expect(updated[1]?.googleCalendarEventId).toBe(
          "master-xyz_20280111T100000Z",
        );
        // 3 件目は startTime 不一致で write-back skip → 未 sync のまま null
        expect(updated[2]?.googleCalendarEventId).toBeNull();
      } finally {
        await fixture.cleanup();
      }
    }, 30_000);
  },
);
