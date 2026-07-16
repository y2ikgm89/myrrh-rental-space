/**
 * Meet URL write-back の実 DB 統合テスト（Phase B.1 task 8）。
 *
 * `googleapis` client 境界（`createCalendarEvent` が包む `client.events.insert`）のみを
 * mock し、`event-outbound.ts` / `outbound.ts`（SUT）と
 * `@/shared/domain/events/calendar-sync`（write-back 先）は実装のまま実 DB に対して
 * 動作させる。検証する契約は 3 つ:
 *
 * 1. `Event.meetingProvider === "GOOGLE_MEET"` の slot sync は `createCalendarEvent` に
 *    `withMeet: true` を渡し、応答の hangoutLink を `Event.meetingUrl` に write-back する
 * 2. `Event.meetingProvider === "MANUAL"` の slot sync は `withMeet: false` を渡し、
 *    write-back を一切試みない
 * 3. Reservation sync は `withMeet: true` を渡さない（物理 space 予約に Meet URL を
 *    付与しない、Phase B.1 で確定した業界標準）
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe ごと skip）。gateway は
 * import 時の `process.env.DATABASE_URL` を読むため、動的 import より前に上書きする
 * （`online-format.test.ts` と同型）。
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
import type { CalendarEventParams } from "@/shared/lib/google-calendar/types";
import type {
  EventFormatValue,
  MeetingProviderValue,
} from "@/shared/lib/validations/enums/prisma-types";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// =============================================================================
// Mocks（googleapis client 境界のみ。SUT・calendar-sync domain 層は実装のまま）
// =============================================================================

type MockCreateResult = {
  success: boolean;
  eventId?: string;
  eventUrl?: string;
  event?: calendar_v3.Schema$Event;
  error?: string;
};

const mockIsEnabled = mock<() => Promise<boolean>>(() => Promise.resolve(true));
const mockCreate = mock<
  (
    params: CalendarEventParams,
    options?: { withMeet?: boolean },
  ) => Promise<MockCreateResult>
>(() => Promise.resolve({ success: true, eventId: "gcal-default" }));

mock.module("@/shared/lib/google-calendar", () => ({
  isGoogleCalendarEnabled: mockIsEnabled,
  createCalendarEvent: mockCreate,
  // event-outbound.ts / outbound.ts が barrel から import する残りの export は
  // 本テストで未使用だが、モジュール全体差し替えのためテスト汚染防止に無害スタブを置く。
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

// =============================================================================
// Dynamic imports（gateway の DATABASE_URL 上書き・mock.module 宣言後に読む）
// =============================================================================

type PrismaModule = typeof import("@/shared/db/prisma");
type EventOutboundModule =
  typeof import("@/shared/lib/calendar-sync/event-outbound");
type OutboundModule = typeof import("@/shared/lib/calendar-sync/outbound");
type EventsCalendarSyncModule =
  typeof import("@/shared/domain/events/calendar-sync");
type PrismaTypesModule =
  typeof import("@/shared/lib/validations/enums/prisma-types");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let syncEventToCalendar: EventOutboundModule["syncEventToCalendar"];
let syncReservationToCalendar: OutboundModule["syncReservationToCalendar"];
let getEventSlotsForCalendarSync: EventsCalendarSyncModule["getEventSlotsForCalendarSync"];
let EVENT_FORMAT: PrismaTypesModule["EVENT_FORMAT"];
let MEETING_PROVIDER: PrismaTypesModule["MEETING_PROVIDER"];
let EventScheduleMode: PrismaTypesModule["EventScheduleMode"];

// =============================================================================
// Fixture helpers
// =============================================================================

const createdEventIds: string[] = [];

async function createEventWithSlot(overrides: {
  format: EventFormatValue;
  meetingProvider: MeetingProviderValue;
  meetingUrl: string | null;
}): Promise<{ eventId: string; slotId: string }> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Meet writeback test ${suffix}`,
        slug: `meet-writeback-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        format: overrides.format,
        meetingProvider: overrides.meetingProvider,
        meetingUrl: overrides.meetingUrl,
      },
      select: { id: true },
    });
    const slot = await tx.eventTimeSlot.create({
      data: { eventId: event.id, startAt: start, endAt: end, capacity: 10 },
      select: { id: true },
    });
    return { eventId: event.id, slotId: slot.id };
  });

  createdEventIds.push(result.eventId);
  return result;
}

async function createReservationFixture(): Promise<{
  reservationId: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `meet-writeback-loc-${suffix}`,
      name: `Meet Writeback Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/location.jpg",
      isActive: false,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `meet-writeback-space-${suffix}`,
      name: `Meet Writeback Space ${suffix}`,
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
      lastName: "会議",
      firstName: "花子",
      email: `meet-writeback-${suffix}@example.com`,
      emailCanonical: `meet-writeback-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const endTime = new Date(Date.now() + 50 * 60 * 60 * 1000);

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime,
      endTime,
      status: "CONFIRMED",
      totalPrice: 1000,
      basePrice: 1000,
      rateBreakdownJson: { legacy: true, segments: [] },
      taxRateType: "standard",
      taxRate: 10,
      taxAmount: 100,
      totalPriceWithTax: 1100,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

// =============================================================================
// Suite
// =============================================================================

describeMaybe("Meet URL write-back (event GOOGLE_MEET) [integration]", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ syncEventToCalendar } =
      await import("@/shared/lib/calendar-sync/event-outbound"));
    ({ syncReservationToCalendar } =
      await import("@/shared/lib/calendar-sync/outbound"));
    ({ getEventSlotsForCalendarSync } =
      await import("@/shared/domain/events/calendar-sync"));
    ({ EVENT_FORMAT, MEETING_PROVIDER, EventScheduleMode } =
      await import("@/shared/lib/validations/enums/prisma-types"));

    // 接続プール warm-up（cold start が並行クエリをずらして race を隠すのを防ぐ）。
    await prisma.$queryRaw`SELECT 1`;
  });

  afterEach(() => {
    mockIsEnabled.mockClear();
    mockCreate.mockClear();
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-default" }),
    );
  });

  afterAll(async () => {
    // EventRegistration → EventTicket → Event の順。本テストはどちらも作らないため
    // Event.deleteMany のみで良い（EventTimeSlot は onDelete: Cascade で追従）。
    if (createdEventIds.length > 0) {
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    await basePrisma.$disconnect();
  });

  test("provider=GOOGLE_MEET で slot sync → hangoutLink が Event.meetingUrl に保存", async () => {
    const { eventId, slotId } = await createEventWithSlot({
      format: EVENT_FORMAT.ONLINE,
      meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
      meetingUrl: null,
    });
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        success: true,
        eventId: "gcal-meet-1",
        event: { hangoutLink: "https://meet.google.com/abc-defg-hij" },
      }),
    );

    const contexts = await getEventSlotsForCalendarSync(eventId);
    expect(contexts).toHaveLength(1);
    // Task 5 の select 拡張 + 本 task の mapping 拡張が実際に meetingProvider を運ぶことの証明。
    expect(contexts[0]?.meetingProvider).toBe("GOOGLE_MEET");

    const result = await syncEventToCalendar(contexts[0]!);

    expect(result).toEqual({ success: true, eventId: "gcal-meet-1" });
    expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), {
      withMeet: true,
    });

    const updatedEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(updatedEvent.meetingUrl).toBe(
      "https://meet.google.com/abc-defg-hij",
    );

    const updatedSlot = await prisma.eventTimeSlot.findUniqueOrThrow({
      where: { id: slotId },
    });
    expect(updatedSlot.googleCalendarEventId).toBe("gcal-meet-1");
  });

  test("provider=MANUAL で slot sync → hangoutLink が発行されない、write-back 起きない", async () => {
    const { eventId } = await createEventWithSlot({
      format: EVENT_FORMAT.OFFLINE,
      meetingProvider: MEETING_PROVIDER.MANUAL,
      meetingUrl: null,
    });
    // MANUAL provider の実運用では Google API に conferenceData を要求しないため
    // hangoutLink は返らない。ここでは「返っても無視される」までは主張せず、
    // withMeet:false 経路そのものを検証する。
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-manual-1" }),
    );

    const contexts = await getEventSlotsForCalendarSync(eventId);
    const result = await syncEventToCalendar(contexts[0]!);

    expect(result).toEqual({ success: true, eventId: "gcal-manual-1" });
    expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), {
      withMeet: false,
    });

    const updatedEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(updatedEvent.meetingUrl).toBeNull();
  });

  test("hangoutLink 無し + conferenceData.entryPoints[video] あり → その uri を write-back する", async () => {
    const { eventId } = await createEventWithSlot({
      format: EVENT_FORMAT.ONLINE,
      meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
      meetingUrl: null,
    });
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        success: true,
        eventId: "gcal-meet-2",
        event: {
          conferenceData: {
            entryPoints: [
              { entryPointType: "phone", uri: "tel:+81-3-0000-0000" },
              {
                entryPointType: "video",
                uri: "https://meet.google.com/fallback-uri",
              },
            ],
          },
        },
      }),
    );

    const contexts = await getEventSlotsForCalendarSync(eventId);
    await syncEventToCalendar(contexts[0]!);

    const updatedEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(updatedEvent.meetingUrl).toBe(
      "https://meet.google.com/fallback-uri",
    );
  });

  test("GOOGLE_MEET だが createCalendarEvent 失敗 → write-back を試みない", async () => {
    const { eventId } = await createEventWithSlot({
      format: EVENT_FORMAT.ONLINE,
      meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
      meetingUrl: null,
    });
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: false, error: "API quota exceeded" }),
    );

    const contexts = await getEventSlotsForCalendarSync(eventId);
    const result = await syncEventToCalendar(contexts[0]!);

    expect(result.success).toBe(false);

    const updatedEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    expect(updatedEvent.meetingUrl).toBeNull();
  });

  test("Reservation sync → withMeet=false 固定、hangoutLink 発行されない", async () => {
    const { reservationId, cleanup } = await createReservationFixture();
    try {
      // 万一 API 側が hangoutLink を返しても、Reservation 経路はそもそも
      // response.event を一切参照しない（Reservation.meetingUrl という列自体が
      // 存在しない）ことを併せて示すため、あえて hangoutLink を含む応答を返す。
      mockCreate.mockImplementation(() =>
        Promise.resolve({
          success: true,
          eventId: "gcal-reservation-1",
          event: { hangoutLink: "https://meet.google.com/should-be-ignored" },
        }),
      );

      const result = await syncReservationToCalendar({
        reservationId,
        spaceName: "テストスペース",
        customerName: "テスト太郎",
        customerEmail: "reservation-sync@example.com",
        startTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 50 * 60 * 60 * 1000),
      });

      expect(result).toEqual({ success: true, eventId: "gcal-reservation-1" });
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const [, options] = mockCreate.mock.calls[0] ?? [];
      expect(options?.withMeet).not.toBe(true);

      const updatedReservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId },
      });
      expect(updatedReservation.googleCalendarEventId).toBe(
        "gcal-reservation-1",
      );
    } finally {
      await cleanup();
    }
  });

  test("writeBackMeetingUrl が throw → 外側の sync は success=true（GCal event 作成済み、googleCalendarEventId 保存済み）", async () => {
    const { eventId, slotId } = await createEventWithSlot({
      format: EVENT_FORMAT.ONLINE,
      meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
      meetingUrl: null,
    });

    // GCal イベント作成は成功、Meet URL は返される
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        success: true,
        eventId: "gcal-writeback-fail",
        event: { hangoutLink: "https://meet.google.com/xyz-123-abc" },
      }),
    );

    // prisma.event.updateMany（writeBackMeetingUrl の実装、Codex P1 fix で
    // first-write-wins のため updateMany に変更済）を throw させる
    const originalUpdateMany = prisma.event.updateMany;
    let writeBackAttempted = false;
    prisma.event.updateMany = mock(async (params: any) => {
      if (params.data?.meetingUrl) {
        writeBackAttempted = true;
        throw new Error("Database connection timeout during write-back");
      }
      return originalUpdateMany.call(prisma.event, params);
    }) as any;

    try {
      const contexts = await getEventSlotsForCalendarSync(eventId);
      const result = await syncEventToCalendar(contexts[0]!);

      // 外側の sync は成功を返す（内側の write-back エラーをサイレント化）
      expect(result.success).toBe(true);
      expect(result.eventId).toBe("gcal-writeback-fail");

      // GCal イベント ID は保存されている
      const updatedSlot = await prisma.eventTimeSlot.findUniqueOrThrow({
        where: { id: slotId },
      });
      expect(updatedSlot.googleCalendarEventId).toBe("gcal-writeback-fail");

      // meetingUrl は write-back が失敗したため null のまま（ストランド状態）
      const updatedEvent = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
      });
      expect(updatedEvent.meetingUrl).toBeNull();

      // write-back は試みられたことを確認
      expect(writeBackAttempted).toBe(true);
    } finally {
      // restore original updateMany
      prisma.event.updateMany = originalUpdateMany;
    }
  });

  test("writeBackMeetingUrl は first-write-wins: 既存 meetingUrl があれば上書きしない (Codex PR #1149 P1)", async () => {
    const { eventId } = await createEventWithSlot({
      format: EVENT_FORMAT.ONLINE,
      meetingProvider: MEETING_PROVIDER.GOOGLE_MEET,
      meetingUrl: "https://meet.google.com/first-slot-original",
    });

    // GCal イベント作成成功、新しい Meet URL を返す
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        success: true,
        eventId: "gcal-second-slot",
        event: { hangoutLink: "https://meet.google.com/second-slot-new" },
      }),
    );

    const contexts = await getEventSlotsForCalendarSync(eventId);
    await syncEventToCalendar(contexts[0]!);

    const updatedEvent = await prisma.event.findUniqueOrThrow({
      where: { id: eventId },
    });
    // 既存 URL のまま、新しい URL で上書きされない (last-write-wins bug を防止)
    expect(updatedEvent.meetingUrl).toBe(
      "https://meet.google.com/first-slot-original",
    );
  });
});
