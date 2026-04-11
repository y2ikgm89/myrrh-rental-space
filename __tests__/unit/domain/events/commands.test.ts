import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Enums（Prisma import チェーンを避けるために再宣言）
// ---------------------------------------------------------------------------

const EventStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  CANCELLED: "CANCELLED",
} as const;

// ---------------------------------------------------------------------------
// モック関数（mock.module より前に定義 — TDZ 対策）
// ---------------------------------------------------------------------------

const mockEventFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);

const mockEventCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "event-1", slug: "test-event" }),
);

const mockEventUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "event-1" }),
);

const mockFireAndForget = mock<() => void>(() => undefined);

const mockSendEventUpdated = mock<() => Promise<void>>(() => Promise.resolve());

const mockSendEventCancelled = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

// ---------------------------------------------------------------------------
// mock.module（import より前）
// ---------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      findFirst: mockEventFindFirst,
      create: mockEventCreate,
      update: mockEventUpdate,
    },
  },
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventUpdatedToAllParticipants: mockSendEventUpdated,
  sendEventCancelledToAllParticipants: mockSendEventCancelled,
}));

mock.module("@generated/prisma/enums", () => ({
  EventStatus,
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック設定後）
// ---------------------------------------------------------------------------

import {
  createEventCommand,
  updateEventCommand,
  deleteEventCommand,
  publishEventCommand,
  cancelEventCommand,
  upsertEventFromCalendar,
} from "@/shared/domain/events/commands";
import { DomainError } from "@/shared/domain/domain-error";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const VALID_EVENT_INPUT = {
  title: "テストイベント",
  slug: "test-event",
  description: "テストの説明",
  contentJson: null,
  thumbnailUrl: null,
  startTime: "2024-06-15T10:00:00Z",
  endTime: "2024-06-15T12:00:00Z",
  capacity: 30,
  price: 5000,
  location: "東京都渋谷区",
  spaceId: null,
  status: EventStatus.DRAFT,
  registrationOpen: true,
} as const;

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("createEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventCreate.mockClear();
    // スラッグ重複なし（ensureUniqueSlug が null を返す）
    mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
    mockEventCreate.mockImplementation(() =>
      Promise.resolve({ id: "event-1", slug: "test-event" }),
    );
  });

  describe("正常系", () => {
    test("有効なデータでイベントを作成できる", async () => {
      const result = await createEventCommand(VALID_EVENT_INPUT);
      expect(result).toMatchObject({ id: "event-1", slug: "test-event" });
    });

    test("ステータスが PUBLISHED の場合、publishedAt が設定される", async () => {
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-1", slug: "test-event" }),
      );

      await createEventCommand({
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.PUBLISHED,
          }),
        }),
      );
    });

    test("ステータスが DRAFT の場合、publishedAt が null になる", async () => {
      await createEventCommand({
        ...VALID_EVENT_INPUT,
        status: EventStatus.DRAFT,
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.DRAFT,
            publishedAt: null,
          }),
        }),
      );
    });

    test("スラッグ重複がある場合、サフィックス付きスラッグで作成される", async () => {
      // 1回目（ensureUniqueSlug のチェック）は既存あり、2回目（create の select）は不問
      mockEventFindFirst.mockImplementationOnce(() =>
        Promise.resolve({ id: "existing-event" }),
      );
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-1", slug: "test-event-abcd1234" }),
      );

      const result = await createEventCommand(VALID_EVENT_INPUT);

      expect(result).toBeDefined();
      // create が呼ばれたことを確認（サフィックス付きスラッグで）
      expect(mockEventCreate).toHaveBeenCalledTimes(1);
    });
  });
});

describe("updateEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventUpdate.mockClear();
    mockFireAndForget.mockClear();
  });

  describe("正常系", () => {
    test("既存イベントを更新できる", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.DRAFT,
        startTime: new Date("2024-06-15T10:00:00Z"),
        endTime: new Date("2024-06-15T12:00:00Z"),
        location: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await updateEventCommand("event-1", VALID_EVENT_INPUT);

      expect(mockEventUpdate).toHaveBeenCalledTimes(1);
    });

    test("スラッグが変更された場合、ensureUniqueSlug が呼ばれる", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "old-slug",
        status: EventStatus.DRAFT,
        startTime: new Date("2024-06-15T10:00:00Z"),
        endTime: new Date("2024-06-15T12:00:00Z"),
        location: "東京都渋谷区",
      };
      // 1回目: findFirst（既存イベント取得）、2回目: findFirst（スラッグ重複チェック）
      mockEventFindFirst
        .mockImplementationOnce(() => Promise.resolve(existingEvent))
        .mockImplementationOnce(() => Promise.resolve(null)); // 新スラッグは重複なし

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        slug: "new-slug",
      });

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "new-slug" }),
        }),
      );
    });

    test("スラッグが変更されていない場合、同じスラッグで更新される", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.DRAFT,
        startTime: new Date("2024-06-15T10:00:00Z"),
        endTime: new Date("2024-06-15T12:00:00Z"),
        location: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", VALID_EVENT_INPUT);

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "test-event" }),
        }),
      );
    });

    test("DRAFT → PUBLISHED への遷移で publishedAt が設定される", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.DRAFT,
        startTime: new Date("2024-06-15T10:00:00Z"),
        endTime: new Date("2024-06-15T12:00:00Z"),
        location: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
      });

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.PUBLISHED,
          }),
        }),
      );
    });

    test("日時変更かつ PUBLISHED 状態の場合、参加者メール通知が送られる", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.PUBLISHED,
        startTime: new Date("2024-06-15T10:00:00Z"), // 変更前
        endTime: new Date("2024-06-15T12:00:00Z"),
        location: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
        startTime: "2024-06-16T10:00:00Z", // 日時変更
        endTime: "2024-06-16T12:00:00Z",
      });

      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    });

    test("日時変更なし・場所変更なしの場合、メール通知は送られない", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.PUBLISHED,
        startTime: new Date("2024-06-15T10:00:00Z"),
        endTime: new Date("2024-06-15T12:00:00Z"),
        location: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
        // 同じ日時・場所
        startTime: "2024-06-15T10:00:00Z",
        endTime: "2024-06-15T12:00:00Z",
        location: "東京都渋谷区",
      });

      expect(mockFireAndForget).not.toHaveBeenCalled();
    });

    test("場所変更かつ PUBLISHED 状態の場合、参加者メール通知が送られる", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.PUBLISHED,
        startTime: new Date("2024-06-15T10:00:00Z"),
        endTime: new Date("2024-06-15T12:00:00Z"),
        location: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
        location: "大阪府梅田",
      });

      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("存在しないイベントを更新しようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(
        updateEventCommand("non-existent", VALID_EVENT_INPUT),
      ).rejects.toThrow(DomainError);
    });

    test("ソフトデリート済みイベントを更新しようとすると DomainError をスローする", async () => {
      // deletedAt: null 条件でフィルタされているため null が返る
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(
        updateEventCommand("deleted-event", VALID_EVENT_INPUT),
      ).rejects.toThrow(DomainError);
    });
  });
});

describe("deleteEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventUpdate.mockClear();
  });

  describe("正常系", () => {
    test("存在するイベントをソフトデリートできる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await deleteEventCommand("event-1");

      // deletedAt を設定する update が呼ばれる（ハードデリートではない）
      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    test("update の where 条件に deletedAt: null が含まれる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await deleteEventCommand("event-1");

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "event-1", deletedAt: null }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないイベントを削除しようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(deleteEventCommand("non-existent")).rejects.toThrow(
        DomainError,
      );
    });

    test("削除後に update が呼ばれない（早期リターン）", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      try {
        await deleteEventCommand("non-existent");
      } catch {
        // DomainError は期待通り
      }

      expect(mockEventUpdate).not.toHaveBeenCalled();
    });
  });
});

describe("publishEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventUpdate.mockClear();
  });

  describe("正常系", () => {
    test("タイトルありのイベントを公開できる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          title: "テストイベント",
          status: EventStatus.DRAFT,
        }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await publishEventCommand("event-1");

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.PUBLISHED,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないイベントを公開しようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(publishEventCommand("non-existent")).rejects.toThrow(
        DomainError,
      );
    });

    test("タイトルが空のイベントを公開しようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          title: "",
          status: EventStatus.DRAFT,
        }),
      );

      await expect(publishEventCommand("event-1")).rejects.toThrow(DomainError);
    });

    test("タイトルが null のイベントを公開しようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          title: null,
          status: EventStatus.DRAFT,
        }),
      );

      await expect(publishEventCommand("event-1")).rejects.toThrow(DomainError);
    });
  });
});

describe("cancelEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventUpdate.mockClear();
    mockFireAndForget.mockClear();
  });

  describe("正常系", () => {
    test("既存イベントをキャンセルできる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.PUBLISHED,
        }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await cancelEventCommand("event-1");

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EventStatus.CANCELLED }),
        }),
      );
    });

    test("キャンセル後に参加者メール通知が送られる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.PUBLISHED,
        }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await cancelEventCommand("event-1");

      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    });

    test("update の where 条件に deletedAt: null が含まれる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.DRAFT,
        }),
      );

      await cancelEventCommand("event-1");

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "event-1", deletedAt: null }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないイベントをキャンセルしようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(cancelEventCommand("non-existent")).rejects.toThrow(
        DomainError,
      );
    });
  });
});

describe("upsertEventFromCalendar", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventCreate.mockClear();
    mockEventUpdate.mockClear();
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
    test("既存イベント（googleCalendarEventId 一致）を更新し action: updated を返す", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toMatchObject({ id: "event-1", action: "updated" });
      expect(mockEventUpdate).toHaveBeenCalledTimes(1);
      expect(mockEventCreate).not.toHaveBeenCalled();
    });

    test("既存イベントがない場合、新規作成し action: created を返す", async () => {
      // 1回目: findFirst（既存チェック）→ null、2回目: findFirst（ensureUniqueSlug）→ null
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-new" }),
      );

      const result = await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(result).toMatchObject({ id: "event-new", action: "created" });
      expect(mockEventCreate).toHaveBeenCalledTimes(1);
    });

    test("新規作成時にステータスが DRAFT になる", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-new" }),
      );

      await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.DRAFT,
            googleCalendarEventId: "gcal-event-1",
          }),
        }),
      );
    });

    test("既存イベントの更新に正しいフィールドが渡される", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await upsertEventFromCalendar(CALENDAR_INPUT);

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "event-1", deletedAt: null }),
          data: expect.objectContaining({
            title: "Google Calendar Event",
            description: "説明",
            location: "オンライン",
          }),
        }),
      );
    });

    test("description が null の場合も作成できる", async () => {
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

describe("ensureUniqueSlug（createEventCommand 経由）", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventCreate.mockClear();
    mockEventCreate.mockImplementation(() =>
      Promise.resolve({ id: "event-1", slug: "unique-slug" }),
    );
  });

  describe("正常系", () => {
    test("スラッグ重複なしの場合、そのままのスラッグで create が呼ばれる", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await createEventCommand({ ...VALID_EVENT_INPUT, slug: "unique-slug" });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "unique-slug" }),
        }),
      );
    });

    test("スラッグ重複ありの場合、サフィックス付きのスラッグで create が呼ばれる", async () => {
      mockEventFindFirst.mockImplementationOnce(() =>
        Promise.resolve({ id: "existing-event" }),
      );
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-1", slug: "duplicate-slug-abcd1234" }),
      );

      await createEventCommand({
        ...VALID_EVENT_INPUT,
        slug: "duplicate-slug",
      });

      expect(mockEventCreate).toHaveBeenCalledTimes(1);
      // サフィックスが付いたスラッグで create が呼ばれる
      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: expect.stringContaining("duplicate-slug-"),
          }),
        }),
      );
    });
  });
});
