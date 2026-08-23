import { describe, test, expect, mock, beforeEach } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

const EventStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;

const RegistrationStatus = {
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
  WAITLISTED: "WAITLISTED",
  WAITLISTED_OFFERED: "WAITLISTED_OFFERED",
  EXPIRED: "EXPIRED",
} as const;

const mockEventFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockEventFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockEventFindMany = mock<() => Promise<{ slug: string }[]>>(() =>
  Promise.resolve([]),
);
const mockEventCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "event-1", slug: "test-event" }),
);
const mockEventUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "event-1" }),
);
const mockEventUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);
const mockEventTimeSlotFindFirst = mock<
  () => Promise<{ id: string; eventId: string } | null>
>(() => Promise.resolve(null));
const mockEventTimeSlotCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "slot-1" }),
);
const mockEventTimeSlotUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "slot-1" }),
);
const mockEventTimeSlotAggregate = mock<
  () => Promise<{
    _min: { startAt: Date | null };
    _max: { endAt: Date | null };
  }>
>(() =>
  Promise.resolve({
    _min: { startAt: new Date("2026-12-01T10:00:00Z") },
    _max: { endAt: new Date("2026-12-01T12:00:00Z") },
  }),
);
const mockEventCategoryFindFirst = mock<() => Promise<{ id: string } | null>>(
  () => Promise.resolve({ id: "fallback-category-1" }),
);

type TxClient = {
  event: {
    create: typeof mockEventCreate;
    update: typeof mockEventUpdate;
  };
  eventTimeSlot: {
    create: typeof mockEventTimeSlotCreate;
    update: typeof mockEventTimeSlotUpdate;
    aggregate: typeof mockEventTimeSlotAggregate;
  };
};
const txStub: TxClient = {
  event: { create: mockEventCreate, update: mockEventUpdate },
  eventTimeSlot: {
    create: mockEventTimeSlotCreate,
    update: mockEventTimeSlotUpdate,
    aggregate: mockEventTimeSlotAggregate,
  },
};
const mockTransaction = mock(
  async (callback: (tx: TxClient) => Promise<unknown>) => callback(txStub),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      findFirst: mockEventFindFirst,
      findUnique: mockEventFindUnique,
      findMany: mockEventFindMany,
      create: mockEventCreate,
      update: mockEventUpdate,
      updateMany: mockEventUpdateMany,
    },
    eventTimeSlot: {
      findFirst: mockEventTimeSlotFindFirst,
    },
    eventCategory: {
      findFirst: mockEventCategoryFindFirst,
    },
    $transaction: mockTransaction,
  },
}));

// **実モジュールを spread する（監査 A-50）。** 2 enum だけの全体置換は、
// 実装が他の enum を読むようになった瞬間に `undefined` 比較を常に false にする。
await installPrismaEnumsMock({ EventStatus, RegistrationStatus });

const mockLockSpaceForTransaction = mock<(...args: unknown[]) => Promise<void>>(
  () => Promise.resolve(),
);
type OverlapResult =
  | { hasOverlap: false }
  | { hasOverlap: true; type: "reservation" | "event"; conflictId: string };
const mockCheckSpaceOverlap = mock<
  (...args: unknown[]) => Promise<OverlapResult>
>(() => Promise.resolve({ hasOverlap: false }));

mock.module("@/shared/domain/reservations/space-locks", () => ({
  lockSpaceForTransaction: mockLockSpaceForTransaction,
}));

mock.module("@/shared/domain/spaces/overlap", () => ({
  checkSpaceOverlap: mockCheckSpaceOverlap,
  isActiveEventStatus: (status: string) =>
    status === EventStatus.DRAFT || status === EventStatus.PUBLISHED,
}));

import {
  cancelImportedEventFromCalendar,
  upsertEventFromCalendar,
} from "@/shared/domain/events/event-calendar-import-commands";

describe("upsertEventFromCalendar", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventFindMany.mockClear();
    mockEventCreate.mockClear();
    mockEventUpdate.mockClear();
    mockEventUpdateMany.mockClear();
    mockEventTimeSlotFindFirst.mockClear();
    // create/update/aggregate も毎回クリアする。これが無いと「呼ばれていない」の
    // assertion が前のテストの呼出を拾って落ちる（実際に落ちた）。
    mockEventTimeSlotCreate.mockClear();
    mockEventTimeSlotUpdate.mockClear();
    mockEventTimeSlotAggregate.mockClear();
    mockEventCategoryFindFirst.mockClear();
    mockEventFindMany.mockImplementation(() => Promise.resolve([]));
    mockEventTimeSlotFindFirst.mockImplementation(() => Promise.resolve(null));
    // 更新保護判定の既定: DRAFT かつアクティブ申込なし → 上書き可
    mockEventFindFirst.mockImplementation(() =>
      Promise.resolve({
        id: "event-1",
        status: EventStatus.DRAFT,
        registrations: [],
      }),
    );
    // 新規作成分岐（既存スロットなし）のフォールバックカテゴリー解決を既定で成功させる。
    mockEventCategoryFindFirst.mockImplementation(() =>
      Promise.resolve({ id: "fallback-category-1" }),
    );
    mockLockSpaceForTransaction.mockClear();
    mockCheckSpaceOverlap.mockClear();
    mockCheckSpaceOverlap.mockImplementation(() =>
      Promise.resolve({ hasOverlap: false }),
    );
  });

  const CALENDAR_INPUT = {
    googleCalendarEventId: "gcal-event-1",
    title: "Google Calendar Event",
    description: "説明",
    startTime: new Date("2024-06-15T10:00:00Z"),
    endTime: new Date("2024-06-15T12:00:00Z"),
    location: "オンライン",
  };

  describe("正常系", () => {
    test("既存スロット（googleCalendarEventId 一致）を更新し action: updated を返す", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "slot-1", eventId: "event-1" }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toMatchObject({ id: "event-1", action: "updated" });
      // 1 回目 = event 本体更新、2 回目 = firstSlotStartAt/lastSlotEndAt 同期
      expect(mockEventUpdate).toHaveBeenCalledTimes(2);
      expect(mockEventCreate).not.toHaveBeenCalled();
    });

    test("Space を持つイベントは、移動先が埋まっていれば上書きせず skipped: space_conflict", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "slot-1", eventId: "event-1" }),
      );
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.DRAFT,
          spaceId: "space-1",
          registrations: [],
        }),
      );
      mockCheckSpaceOverlap.mockImplementation(() =>
        Promise.resolve({
          hasOverlap: true,
          type: "reservation",
          conflictId: "res-1",
        }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toEqual({
        id: "event-1",
        action: "skipped",
        reason: "space_conflict",
      });
      // 押さえ直しの検査より先に advisory lock を取る（他の書込経路と同じ順序）。
      expect(mockLockSpaceForTransaction).toHaveBeenCalled();
      expect(mockEventUpdate).not.toHaveBeenCalled();
      expect(mockEventTimeSlotUpdate).not.toHaveBeenCalled();
    });

    test("Space を持つイベントでも、移動先が空いていれば更新する（自スロットは検査対象から外す）", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "slot-1", eventId: "event-1" }),
      );
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.DRAFT,
          spaceId: "space-1",
          registrations: [],
        }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toMatchObject({ id: "event-1", action: "updated" });
      expect(mockCheckSpaceOverlap).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: "space-1",
          startTime: CALENDAR_INPUT.startTime,
          endTime: CALENDAR_INPUT.endTime,
          excludeEventSlotId: "slot-1",
        }),
        expect.anything(),
      );
    });

    test("PUBLISHED イベントは上書きせず action: skipped を返す", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "slot-1", eventId: "event-1" }),
      );
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.PUBLISHED,
          registrations: [],
        }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toEqual({
        id: "event-1",
        action: "skipped",
        reason: "published_event_protected",
      });
      expect(mockEventUpdate).not.toHaveBeenCalled();
    });

    test("非キャンセル申込があるイベントは上書きせず action: skipped を返す", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "slot-1", eventId: "event-1" }),
      );
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.DRAFT,
          registrations: [{ id: "reg-1" }],
        }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toEqual({
        id: "event-1",
        action: "skipped",
        reason: "has_active_registrations",
      });
      expect(mockEventUpdate).not.toHaveBeenCalled();
    });

    test("既存スロットがない場合、新規作成し action: created を返す", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve(null),
      );
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-new" }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toMatchObject({ id: "event-new", action: "created" });
      expect(mockEventCreate).toHaveBeenCalledTimes(1);
    });

    test("新規作成時にステータスが DRAFT になる", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve(null),
      );
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-new" }),
      );

      await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.DRAFT,
            firstSlotStartAt: CALENDAR_INPUT.startTime,
            lastSlotEndAt: CALENDAR_INPUT.endTime,
          }),
        }),
      );
    });

    test("既存スロット紐づきの event 更新に正しいフィールドが渡される", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "slot-1", eventId: "event-1" }),
      );

      await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "event-1",
            deletedAt: null,
          }),
          data: expect.objectContaining({
            title: "Google Calendar Event",
            // Google Calendar の location 文字列は addressDetail に格納される
            addressDetail: "オンライン",
          }),
        }),
      );
    });

    test("description が null の場合も作成できる", async () => {
      mockEventTimeSlotFindFirst.mockImplementation(() =>
        Promise.resolve(null),
      );
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-new" }),
      );

      const result = await upsertEventFromCalendar({
        ...CALENDAR_INPUT,
        description: null,
      });

      expect(result).toMatchObject({ action: "created" });
    });
  });
});

describe("cancelImportedEventFromCalendar", () => {
  beforeEach(() => {
    mockEventTimeSlotFindFirst.mockClear();
    mockEventUpdateMany.mockClear();
    mockEventFindUnique.mockClear();
    mockEventTimeSlotFindFirst.mockImplementation(() => Promise.resolve(null));
    mockEventUpdateMany.mockImplementation(() => Promise.resolve({ count: 1 }));
    // 反映してよい既定形（DRAFT・有効な申込なし）。公開中 / 申込ありのガードは
    // 実 DB で見る（__tests__/integration/domain/events/calendar-cancel-guard.test.ts）。
    mockEventFindUnique.mockImplementation(() =>
      Promise.resolve({
        id: "event-1",
        title: "Imported Event",
        status: EventStatus.DRAFT,
        deletedAt: null,
        registrations: [],
      }),
    );
  });

  test("対象スロットが無い場合は cancelled: false を返す", async () => {
    const result = await cancelImportedEventFromCalendar("missing-gcal-id");
    expect(result).toEqual({ cancelled: false });
    expect(mockEventUpdateMany).not.toHaveBeenCalled();
  });

  test("対象スロットがある場合は CANCELLED へ claim する", async () => {
    mockEventTimeSlotFindFirst.mockImplementation(() =>
      Promise.resolve({ id: "slot-1", eventId: "event-1" }),
    );

    const result = await cancelImportedEventFromCalendar("gcal-event-1");

    expect(result).toEqual({ cancelled: true });
    expect(mockEventUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "event-1",
          deletedAt: null,
          status: { not: EventStatus.CANCELLED },
        }),
        data: { status: EventStatus.CANCELLED },
      }),
    );
  });

  test("既に CANCELLED の場合は cancelled: false を返す", async () => {
    mockEventTimeSlotFindFirst.mockImplementation(() =>
      Promise.resolve({ id: "slot-1", eventId: "event-1" }),
    );
    mockEventUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));

    const result = await cancelImportedEventFromCalendar("gcal-event-1");
    expect(result).toEqual({ cancelled: false });
  });
});
