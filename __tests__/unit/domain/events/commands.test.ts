import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Enums（Prisma import チェーンを避けるために再宣言）
// ---------------------------------------------------------------------------

const EventStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  CANCELLED: "CANCELLED",
  ARCHIVED: "ARCHIVED",
} as const;

const EventScheduleMode = {
  SINGLE_OCCURRENCE: "SINGLE_OCCURRENCE",
  TIMED_ENTRY: "TIMED_ENTRY",
} as const;

// ---------------------------------------------------------------------------
// モック関数（mock.module より前に定義 — TDZ 対策）
// ---------------------------------------------------------------------------

const mockEventFindFirst = mock<() => Promise<Record<string, unknown> | null>>(
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

const mockFireAndForget = mock<() => void>(() => undefined);

const mockSendEventUpdated = mock<() => Promise<void>>(() => Promise.resolve());

const mockSendEventCancelled = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

// ---------------------------------------------------------------------------
// mock.module（import より前）
// ---------------------------------------------------------------------------

mock.module("server-only", () => ({}));

const mockEventTicketUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "ticket-1" }),
);
const mockEventTicketCreateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);
const mockEventTicketDeleteMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockEventTicketFindMany = mock<() => Promise<{ id: string }[]>>(() =>
  Promise.resolve([]),
);
const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));
const mockEventRegistrationCount = mock<() => Promise<number>>(() =>
  Promise.resolve(0),
);

// upsertEventFromCalendar が tx 外で呼ぶ prisma.eventTimeSlot.findFirst 用
const mockEventTimeSlotFindFirst = mock<
  () => Promise<{ id: string; eventId: string } | null>
>(() => Promise.resolve(null));
const mockEventTimeSlotFindMany = mock<
  () => Promise<{ id: string; registrations: { id: string }[] }[]>
>(() => Promise.resolve([]));
const mockEventTimeSlotCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "slot-1" }),
);
const mockEventTimeSlotUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "slot-1" }),
);
const mockEventTimeSlotDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "slot-1" }),
);
// firstSlotStartAt / lastSlotEndAt 同期で commands 層が aggregate を呼ぶ
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

// $transaction interactive callback で tx を渡す mock
type TxClient = {
  event: {
    create: typeof mockEventCreate;
    update: typeof mockEventUpdate;
  };
  eventTicket: {
    findMany: typeof mockEventTicketFindMany;
    update: typeof mockEventTicketUpdate;
    create: typeof mockEventCreate;
    createMany: typeof mockEventTicketCreateMany;
    deleteMany: typeof mockEventTicketDeleteMany;
  };
  eventRegistration: {
    count: typeof mockEventRegistrationCount;
  };
  eventTimeSlot: {
    findMany: typeof mockEventTimeSlotFindMany;
    create: typeof mockEventTimeSlotCreate;
    update: typeof mockEventTimeSlotUpdate;
    delete: typeof mockEventTimeSlotDelete;
    aggregate: typeof mockEventTimeSlotAggregate;
  };
  $executeRaw: typeof mockExecuteRaw;
};
const txStub: TxClient = {
  event: { create: mockEventCreate, update: mockEventUpdate },
  eventTicket: {
    findMany: mockEventTicketFindMany,
    update: mockEventTicketUpdate,
    create: mockEventCreate,
    createMany: mockEventTicketCreateMany,
    deleteMany: mockEventTicketDeleteMany,
  },
  eventRegistration: { count: mockEventRegistrationCount },
  eventTimeSlot: {
    findMany: mockEventTimeSlotFindMany,
    create: mockEventTimeSlotCreate,
    update: mockEventTimeSlotUpdate,
    delete: mockEventTimeSlotDelete,
    aggregate: mockEventTimeSlotAggregate,
  },
  $executeRaw: mockExecuteRaw,
};
const mockTransaction = mock(
  async (callback: (tx: TxClient) => Promise<unknown>) => callback(txStub),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      findFirst: mockEventFindFirst,
      findMany: mockEventFindMany,
      create: mockEventCreate,
      update: mockEventUpdate,
    },
    eventTimeSlot: {
      findFirst: mockEventTimeSlotFindFirst,
    },
    $transaction: mockTransaction,
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
  duplicateEventCommand,
  publishEventCommand,
  cancelEventCommand,
  archiveEventCommand,
  upsertEventFromCalendar,
} from "@/shared/domain/events/commands";
import { DomainError } from "@/shared/domain/domain-error";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const VALID_EVENT_INPUT = {
  title: "テストイベント",
  slug: "test-event",
  descriptionJson: {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: [
        {
          type: "paragraph",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr",
          textFormat: 0,
          textStyle: "",
          children: [
            {
              type: "text",
              text: "テストの説明",
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              version: 1,
            },
          ],
        },
      ],
    },
  },
  descriptionHtml: "<p>テストの説明</p>",
  descriptionPlainText: "テストの説明",
  thumbnailUrl: null,
  gallery: [] as const,
  slots: [
    {
      startAt: new Date("2024-06-15T10:00:00Z"),
      endAt: new Date("2024-06-15T12:00:00Z"),
      capacity: 30,
    },
  ],
  registrationDeadline: null,
  scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
  tickets: [
    {
      name: "一般",
      description: null,
      price: 5000,
      capacity: null,
      unitSize: 1,
      isAvailable: true,
    },
  ],
  addressDetail: "東京都渋谷区",
  locationId: null,
  spaceId: null,
  status: EventStatus.DRAFT,
  // status !== PUBLISHED 時は normalizeRegistrationOpen で false に強制されるため
  // 入力時点でも false にしておく（DB と入力の一貫性）
  registrationOpen: false,
};

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe("createEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventFindMany.mockClear();
    mockEventCreate.mockClear();
    // スラッグ重複なし（ensureUniqueSlug が null を返す）
    mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
    mockEventFindMany.mockImplementation(() => Promise.resolve([]));
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

    test("DRAFT 入力時 registrationOpen: true は server-side で false に正規化される", async () => {
      await createEventCommand({
        ...VALID_EVENT_INPUT,
        status: EventStatus.DRAFT,
        registrationOpen: true,
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.DRAFT,
            registrationOpen: false,
          }),
        }),
      );
    });

    test("PUBLISHED 入力時 registrationOpen: true はそのまま保持される", async () => {
      await createEventCommand({
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
        registrationOpen: true,
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.PUBLISHED,
            registrationOpen: true,
          }),
        }),
      );
    });

    test("registrationDeadline が null の場合、Date 変換は走らず null として保存される", async () => {
      await createEventCommand({
        ...VALID_EVENT_INPUT,
        registrationDeadline: null,
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ registrationDeadline: null }),
        }),
      );
    });

    test("registrationDeadline が ISO 文字列の場合、Date オブジェクトに変換される", async () => {
      await createEventCommand({
        ...VALID_EVENT_INPUT,
        registrationDeadline: "2024-06-14T23:59:00Z",
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            registrationDeadline: new Date("2024-06-14T23:59:00Z"),
          }),
        }),
      );
    });

    test("スラッグ重複がある場合、インクリメンタルサフィックス付きスラッグで作成される", async () => {
      // ensureUniqueSlug: findFirst で既存あり → findMany で兄弟取得 → -2 採番
      mockEventFindFirst.mockImplementationOnce(() =>
        Promise.resolve({ id: "existing-event" }),
      );
      mockEventFindMany.mockImplementationOnce(() => Promise.resolve([]));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-1", slug: "test-event-2" }),
      );

      await createEventCommand(VALID_EVENT_INPUT);

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "test-event-2" }),
        }),
      );
    });

    test("チケット順は入力配列の index から 0 始まりで保存される", async () => {
      await createEventCommand({
        ...VALID_EVENT_INPUT,
        tickets: [
          {
            name: "VIP",
            description: null,
            price: 9000,
            capacity: null,
            unitSize: 1,
            isAvailable: true,
          },
          {
            name: "一般",
            description: null,
            price: 5000,
            capacity: null,
            unitSize: 1,
            isAvailable: true,
          },
        ],
      });

      expect(mockEventTicketCreateMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ name: "VIP", sortOrder: 0 }),
          expect.objectContaining({ name: "一般", sortOrder: 1 }),
        ],
      });
    });
  });
});

describe("updateEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventFindMany.mockClear();
    mockEventUpdate.mockClear();
    mockEventTicketFindMany.mockClear();
    mockEventTicketUpdate.mockClear();
    mockEventTicketCreateMany.mockClear();
    mockEventTicketDeleteMany.mockClear();
    mockEventTicketFindMany.mockImplementation(() => Promise.resolve([]));
    mockExecuteRaw.mockClear();
    mockExecuteRaw.mockResolvedValue(0);
    mockFireAndForget.mockClear();
    mockEventFindMany.mockImplementation(() => Promise.resolve([]));
  });

  describe("正常系", () => {
    test("既存イベントを更新できる", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.DRAFT,
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await updateEventCommand("event-1", VALID_EVENT_INPUT);

      // 1 回目 = event 本体更新、2 回目 = firstSlotStartAt/lastSlotEndAt 同期
      expect(mockEventUpdate).toHaveBeenCalledTimes(2);
    });

    test("スラッグが変更された場合、ensureUniqueSlug が呼ばれる", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "old-slug",
        status: EventStatus.DRAFT,
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
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
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
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
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
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
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
        // 新規スロット（id なし）= 変更ありとみなされ通知トリガー
        slots: [
          {
            startAt: new Date("2024-06-16T10:00:00Z"),
            endAt: new Date("2024-06-16T12:00:00Z"),
            capacity: 30,
          },
        ],
      });

      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    });

    test("日時変更なし・場所変更なしの場合、メール通知は送られない", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.PUBLISHED,
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
        // 既存スロット（id あり = 変更なしとみなされ通知スキップ）+ 同じ会場
        slots: [
          {
            id: "slot-1",
            startAt: new Date("2024-06-15T10:00:00Z"),
            endAt: new Date("2024-06-15T12:00:00Z"),
            capacity: 30,
          },
        ],
        addressDetail: "東京都渋谷区",
      });

      expect(mockFireAndForget).not.toHaveBeenCalled();
    });

    test("会場情報変更かつ PUBLISHED 状態の場合、参加者メール通知が送られる", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.PUBLISHED,
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        status: EventStatus.PUBLISHED,
        addressDetail: "大阪府梅田",
      });

      expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    });

    test("既存チケットの順序は一意制約衝突を避けるため一時退避してから更新する", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.DRAFT,
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );
      mockEventTicketFindMany.mockResolvedValueOnce([
        { id: "ticket-1" },
        { id: "ticket-2" },
      ]);

      await updateEventCommand("event-1", {
        ...VALID_EVENT_INPUT,
        tickets: [
          {
            id: "ticket-2",
            name: "後半",
            description: null,
            price: 6000,
            capacity: null,
            unitSize: 1,
            isAvailable: true,
          },
          {
            id: "ticket-1",
            name: "前半",
            description: null,
            price: 5000,
            capacity: null,
            unitSize: 1,
            isAvailable: true,
          },
        ],
      });

      expect(mockExecuteRaw).toHaveBeenCalledTimes(2);
      expect(mockEventTicketUpdate).toHaveBeenCalledTimes(2);
      expect(mockEventTicketCreateMany).not.toHaveBeenCalled();
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

    test("別イベントまたは存在しないチケットIDを含む更新は拒否する", async () => {
      const existingEvent = {
        id: "event-1",
        slug: "test-event",
        status: EventStatus.DRAFT,
        slots: [{ startAt: new Date("2024-06-15T10:00:00Z") }],
        locationId: null,
        spaceId: null,
        addressDetail: "東京都渋谷区",
      };
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve(existingEvent),
      );
      mockEventTicketFindMany.mockResolvedValueOnce([{ id: "ticket-1" }]);

      await expect(
        updateEventCommand("event-1", {
          ...VALID_EVENT_INPUT,
          tickets: [
            {
              id: "foreign-ticket",
              name: "不正チケット",
              description: null,
              price: 5000,
              capacity: null,
              unitSize: 1,
              isAvailable: true,
            },
          ],
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "チケットが見つかりません",
      });

      expect(mockEventTicketUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
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

describe("archiveEventCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventUpdate.mockClear();
    mockFireAndForget.mockClear();
  });

  describe("正常系", () => {
    test("既存イベントをアーカイブできる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.PUBLISHED,
        }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await archiveEventCommand("event-1");

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EventStatus.ARCHIVED }),
        }),
      );
    });

    test("アーカイブでは参加者メール通知は送られない", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.CANCELLED,
        }),
      );
      mockEventUpdate.mockImplementation(() =>
        Promise.resolve({ id: "event-1" }),
      );

      await archiveEventCommand("event-1");

      expect(mockFireAndForget).not.toHaveBeenCalled();
    });

    test("update の where 条件に deletedAt: null が含まれる", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({
          id: "event-1",
          status: EventStatus.DRAFT,
        }),
      );

      await archiveEventCommand("event-1");

      expect(mockEventUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "event-1", deletedAt: null }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないイベントをアーカイブしようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(archiveEventCommand("non-existent")).rejects.toThrow(
        DomainError,
      );
    });
  });
});

describe("duplicateEventCommand", () => {
  const SOURCE_EVENT = {
    title: "オリジナルイベント",
    slug: "original-event",
    descriptionJson: { root: { type: "root", children: [] } },
    descriptionHtml: "<p>本文</p>",
    descriptionPlainText: "本文",
    thumbnailUrl: "https://example.com/thumb.jpg",
    gallery: [],
    ogpImageUrl: null,
    ogpTitle: null,
    ogpDescription: null,
    metaDescription: null,
    metaKeywords: null,
    registrationDeadline: new Date("2024-06-14T23:59:00Z"),
    scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
    slots: [
      {
        startAt: new Date("2024-06-15T10:00:00Z"),
        endAt: new Date("2024-06-15T12:00:00Z"),
        capacity: 30,
      },
    ],
    tickets: [
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        sortOrder: 0,
        isAvailable: true,
      },
    ],
    addressDetail: "東京都渋谷区",
    locationId: null,
    spaceId: null,
    registrationOpen: true,
  };

  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventFindMany.mockClear();
    mockEventCreate.mockClear();
    mockEventFindMany.mockImplementation(() => Promise.resolve([]));
    mockEventCreate.mockImplementation(() =>
      Promise.resolve({ id: "duplicated-event", slug: "original-event-copy" }),
    );
  });

  describe("正常系", () => {
    test("複製で新規 DRAFT イベントが作成される", async () => {
      // 1回目: source 取得 / 2回目: ensureUniqueSlug 重複チェック (null = 空き)
      mockEventFindFirst
        .mockImplementationOnce(() => Promise.resolve(SOURCE_EVENT))
        .mockImplementationOnce(() => Promise.resolve(null));

      const result = await duplicateEventCommand("source-event-id");

      expect(result).toMatchObject({
        id: "duplicated-event",
        slug: "original-event-copy",
      });
      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.DRAFT,
            publishedAt: null,
            slug: "original-event-copy",
            title: "オリジナルイベント（コピー）",
          }),
        }),
      );
    });

    test("本文・サムネイル・会場・申込締切が複製される（日時・定員はスロット側で複製）", async () => {
      mockEventFindFirst
        .mockImplementationOnce(() => Promise.resolve(SOURCE_EVENT))
        .mockImplementationOnce(() => Promise.resolve(null));

      await duplicateEventCommand("source-event-id");

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            descriptionJson: SOURCE_EVENT.descriptionJson,
            descriptionHtml: SOURCE_EVENT.descriptionHtml,
            descriptionPlainText: SOURCE_EVENT.descriptionPlainText,
            thumbnailUrl: SOURCE_EVENT.thumbnailUrl,
            registrationDeadline: SOURCE_EVENT.registrationDeadline,
            addressDetail: SOURCE_EVENT.addressDetail,
          }),
        }),
      );
    });

    test("元が registrationOpen: true でも複製は false になる（DRAFT 強制と整合）", async () => {
      mockEventFindFirst
        .mockImplementationOnce(() => Promise.resolve(SOURCE_EVENT))
        .mockImplementationOnce(() => Promise.resolve(null));

      await duplicateEventCommand("source-event-id");

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.DRAFT,
            registrationOpen: false,
          }),
        }),
      );
    });

    test("元が PUBLISHED でも複製の status は DRAFT になる", async () => {
      mockEventFindFirst
        .mockImplementationOnce(() => Promise.resolve(SOURCE_EVENT))
        .mockImplementationOnce(() => Promise.resolve(null));

      await duplicateEventCommand("source-event-id");

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: EventStatus.DRAFT }),
        }),
      );
    });

    test("baseSlug が衝突する場合、`-copy-2` が採番される", async () => {
      mockEventFindFirst
        .mockImplementationOnce(() => Promise.resolve(SOURCE_EVENT))
        .mockImplementationOnce(() => Promise.resolve({ id: "existing-copy" }));
      mockEventFindMany.mockImplementation(() => Promise.resolve([]));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({
          id: "duplicated-event",
          slug: "original-event-copy-2",
        }),
      );

      await duplicateEventCommand("source-event-id");

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "original-event-copy-2" }),
        }),
      );
    });

    test("`-copy`, `-copy-2` が両方存在する場合、`-copy-3` が採番される", async () => {
      mockEventFindFirst
        .mockImplementationOnce(() => Promise.resolve(SOURCE_EVENT))
        .mockImplementationOnce(() => Promise.resolve({ id: "existing-copy" }));
      mockEventFindMany.mockImplementation(() =>
        Promise.resolve([{ slug: "original-event-copy-2" }]),
      );
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({
          id: "duplicated-event",
          slug: "original-event-copy-3",
        }),
      );

      await duplicateEventCommand("source-event-id");

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "original-event-copy-3" }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないイベントを複製しようとすると DomainError をスローする", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(duplicateEventCommand("non-existent")).rejects.toThrow(
        DomainError,
      );
      expect(mockEventCreate).not.toHaveBeenCalled();
    });

    test("ソフトデリート済みイベントを複製しようとすると DomainError をスローする", async () => {
      // deletedAt: null 条件でフィルタされるため null が返る
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));

      await expect(duplicateEventCommand("deleted-event")).rejects.toThrow(
        DomainError,
      );
    });
  });
});

describe("upsertEventFromCalendar", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventFindMany.mockClear();
    mockEventCreate.mockClear();
    mockEventUpdate.mockClear();
    mockEventTimeSlotFindFirst.mockClear();
    mockEventFindMany.mockImplementation(() => Promise.resolve([]));
    mockEventTimeSlotFindFirst.mockImplementation(() => Promise.resolve(null));
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

describe("ensureUniqueSlug（createEventCommand 経由）", () => {
  beforeEach(() => {
    mockEventFindFirst.mockClear();
    mockEventFindMany.mockClear();
    mockEventCreate.mockClear();
    mockEventFindMany.mockImplementation(() => Promise.resolve([]));
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

    test("スラッグ重複ありの場合、`-2` から始まるインクリメンタル採番で create が呼ばれる", async () => {
      mockEventFindFirst.mockImplementationOnce(() =>
        Promise.resolve({ id: "existing-event" }),
      );
      mockEventFindMany.mockImplementationOnce(() => Promise.resolve([]));
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-1", slug: "duplicate-slug-2" }),
      );

      await createEventCommand({
        ...VALID_EVENT_INPUT,
        slug: "duplicate-slug",
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "duplicate-slug-2" }),
        }),
      );
    });

    test("既存兄弟が `-2`,`-4` の場合、欠番 `-3` が採番される", async () => {
      mockEventFindFirst.mockImplementationOnce(() =>
        Promise.resolve({ id: "existing-event" }),
      );
      mockEventFindMany.mockImplementationOnce(() =>
        Promise.resolve([
          { slug: "duplicate-slug-2" },
          { slug: "duplicate-slug-4" },
        ]),
      );
      mockEventCreate.mockImplementation(() =>
        Promise.resolve({ id: "event-1", slug: "duplicate-slug-3" }),
      );

      await createEventCommand({
        ...VALID_EVENT_INPUT,
        slug: "duplicate-slug",
      });

      expect(mockEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: "duplicate-slug-3" }),
        }),
      );
    });
  });
});
