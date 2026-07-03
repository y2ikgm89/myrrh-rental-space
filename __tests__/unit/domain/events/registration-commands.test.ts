import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { EventStatus, RegistrationStatus } from "@generated/prisma/enums";

// ---------------------------------------------------------------------------
// mock 関数定義（import より前）
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  title: string;
  slug: string;
  capacity: number | null;
  registrationOpen: boolean;
  registrationDeadline: Date | null;
  startTime: Date;
};

type TicketRow = {
  id: string;
  name: string;
  capacity: number | null;
};

type SlotRow = {
  id: string;
  eventId: string;
  capacity: number;
  startAt: Date;
};

const mockEventFindFirst = mock<() => Promise<EventRow | null>>(() =>
  Promise.resolve(null),
);
const mockSlotFindUnique = mock<() => Promise<SlotRow | null>>(() =>
  Promise.resolve(null),
);
const mockTicketFindFirst = mock<() => Promise<TicketRow | null>>(() =>
  Promise.resolve(null),
);
const mockRegistrationAggregate = mock<
  () => Promise<{ _sum: { quantity: number | null } }>
>(() => Promise.resolve({ _sum: { quantity: 0 } }));
const mockRegistrationCreate = mock<() => Promise<Record<string, unknown>>>(
  () =>
    Promise.resolve({
      id: "reg-1",
      eventId: "event-1",
      ticketId: "ticket-1",
      name: "山田太郎",
      email: "yamada@example.com",
      quantity: 1,
      icsSequence: 0,
    }),
);
const mockRegistrationFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegistrationUpdate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ attendedAt: new Date("2026-07-01T00:00:00.000Z") }),
);
// 本番コードは先頭で advisory xact lock を tx.$executeRaw で取得する。戻り値（影響行数）は
// 使わないため 0 を返すだけのスタブで足りる。
const mockExecuteRaw = mock<(...args: unknown[]) => Promise<number>>(() =>
  Promise.resolve(0),
);

mock.module("server-only", () => ({}));

// createEventRegistrationCommand は定員集計〜create を prisma.$transaction(async (tx) => {...})
// に閉じるため、$transaction が同じモデル mock を載せた tx を callback に渡すよう模す。
mock.module("@/shared/db/prisma", () => {
  const tx = {
    $executeRaw: mockExecuteRaw,
    event: { findFirst: mockEventFindFirst },
    eventTimeSlot: { findUnique: mockSlotFindUnique },
    eventTicket: { findFirst: mockTicketFindFirst },
    eventRegistration: {
      aggregate: mockRegistrationAggregate,
      create: mockRegistrationCreate,
    },
  };
  return {
    prisma: {
      $transaction: (cb: (client: typeof tx) => Promise<unknown>) => cb(tx),
      eventRegistration: {
        findFirst: mockRegistrationFindFirst,
        update: mockRegistrationUpdate,
      },
    },
  };
});

mock.module("@generated/prisma/enums", () => ({
  EventStatus,
  RegistrationStatus,
}));

import {
  createEventRegistrationCommand,
  setEventRegistrationCheckInCommand,
} from "@/shared/domain/events/registration-commands";
import { DomainError } from "@/shared/domain/domain-error";

// ---------------------------------------------------------------------------
// テスト用定数
// ---------------------------------------------------------------------------

const FUTURE = new Date(Date.now() + 1000 * 60 * 60 * 24);

const BASE_EVENT: EventRow = {
  id: "event-1",
  title: "テストイベント",
  slug: "test-event",
  capacity: null,
  registrationOpen: true,
  registrationDeadline: null,
  startTime: FUTURE,
};

const BASE_TICKET: TicketRow = {
  id: "ticket-1",
  name: "一般",
  capacity: null,
};

const BASE_SLOT: SlotRow = {
  id: "slot-1",
  eventId: "event-1",
  capacity: 1000, // slot が制約にならないよう大きな数
  startAt: FUTURE,
};

const VALID_INPUT = {
  eventId: "event-1",
  slotId: "slot-1",
  ticketId: "ticket-1",
  name: "山田太郎",
  email: "yamada@example.com",
  quantity: 1,
};

describe("createEventRegistrationCommand", () => {
  beforeEach(() => {
    mockEventFindFirst.mockReset();
    mockSlotFindUnique.mockReset();
    mockTicketFindFirst.mockReset();
    mockRegistrationAggregate.mockReset();
    mockRegistrationCreate.mockReset();

    mockEventFindFirst.mockImplementation(() => Promise.resolve(BASE_EVENT));
    mockSlotFindUnique.mockImplementation(() => Promise.resolve(BASE_SLOT));
    mockTicketFindFirst.mockImplementation(() => Promise.resolve(BASE_TICKET));
    mockRegistrationAggregate.mockImplementation(() =>
      Promise.resolve({ _sum: { quantity: 0 } }),
    );
    mockRegistrationCreate.mockImplementation(() =>
      Promise.resolve({
        id: "reg-1",
        eventId: "event-1",
        ticketId: "ticket-1",
        name: "山田太郎",
        email: "yamada@example.com",
        quantity: 1,
        icsSequence: 0,
      }),
    );
  });

  afterEach(() => {
    mock.restore();
  });

  describe("正常系", () => {
    test("capacity 無制限なら申込が作成される", async () => {
      const result = await createEventRegistrationCommand(VALID_INPUT);
      expect(result.registration.id).toBe("reg-1");
      expect(result.event.slug).toBe("test-event");
    });

    test("slot capacity 内なら申込が作成される", async () => {
      mockSlotFindUnique.mockImplementation(() =>
        Promise.resolve({ ...BASE_SLOT, capacity: 10 }),
      );
      mockRegistrationAggregate.mockImplementation(() =>
        Promise.resolve({ _sum: { quantity: 7 } }),
      );
      const result = await createEventRegistrationCommand({
        ...VALID_INPUT,
        quantity: 3,
      });
      expect(result.registration.id).toBe("reg-1");
    });

    test("ticket capacity 内なら申込が作成される", async () => {
      mockTicketFindFirst.mockImplementation(() =>
        Promise.resolve({ ...BASE_TICKET, capacity: 5 }),
      );
      mockRegistrationAggregate.mockImplementation(() =>
        Promise.resolve({ _sum: { quantity: 2 } }),
      );
      const result = await createEventRegistrationCommand({
        ...VALID_INPUT,
        quantity: 3,
      });
      expect(result.registration.id).toBe("reg-1");
    });
  });

  describe("異常系: per-ticket capacity", () => {
    test("ticket capacity を超過すると VALIDATION エラー", async () => {
      mockTicketFindFirst.mockImplementation(() =>
        Promise.resolve({ ...BASE_TICKET, capacity: 5 }),
      );
      mockRegistrationAggregate.mockImplementation(() =>
        Promise.resolve({ _sum: { quantity: 4 } }),
      );
      await expect(
        createEventRegistrationCommand({ ...VALID_INPUT, quantity: 3 }),
      ).rejects.toThrow(DomainError);
    });

    test("ticket が満員（残 0）だと専用メッセージでエラー", async () => {
      mockTicketFindFirst.mockImplementation(() =>
        Promise.resolve({ ...BASE_TICKET, capacity: 5 }),
      );
      mockRegistrationAggregate.mockImplementation(() =>
        Promise.resolve({ _sum: { quantity: 5 } }),
      );
      await expect(
        createEventRegistrationCommand({ ...VALID_INPUT, quantity: 1 }),
      ).rejects.toThrow("「一般」は満員です");
    });

    test("ticket capacity 残数がメッセージに含まれる", async () => {
      mockTicketFindFirst.mockImplementation(() =>
        Promise.resolve({ ...BASE_TICKET, capacity: 10 }),
      );
      mockRegistrationAggregate.mockImplementation(() =>
        Promise.resolve({ _sum: { quantity: 8 } }),
      );
      await expect(
        createEventRegistrationCommand({ ...VALID_INPUT, quantity: 5 }),
      ).rejects.toThrow("残り2枠");
    });
  });

  describe("異常系: その他", () => {
    test("イベントが存在しないと NOT_FOUND", async () => {
      mockEventFindFirst.mockImplementation(() => Promise.resolve(null));
      await expect(createEventRegistrationCommand(VALID_INPUT)).rejects.toThrow(
        "イベントが見つかりません",
      );
    });

    test("registrationOpen が false だと VALIDATION エラー", async () => {
      mockEventFindFirst.mockImplementation(() =>
        Promise.resolve({ ...BASE_EVENT, registrationOpen: false }),
      );
      await expect(createEventRegistrationCommand(VALID_INPUT)).rejects.toThrow(
        "申込受付を終了",
      );
    });

    test("チケットが存在しないと NOT_FOUND", async () => {
      mockTicketFindFirst.mockImplementation(() => Promise.resolve(null));
      await expect(createEventRegistrationCommand(VALID_INPUT)).rejects.toThrow(
        "チケット種別が見つかりません",
      );
    });

    test("slot capacity 超過は VALIDATION エラー", async () => {
      mockSlotFindUnique.mockImplementation(() =>
        Promise.resolve({ ...BASE_SLOT, capacity: 10 }),
      );
      mockRegistrationAggregate.mockImplementation(() =>
        Promise.resolve({ _sum: { quantity: 9 } }),
      );
      await expect(
        createEventRegistrationCommand({ ...VALID_INPUT, quantity: 3 }),
      ).rejects.toThrow("残り1枠");
    });
  });
});

describe("setEventRegistrationCheckInCommand", () => {
  beforeEach(() => {
    mockRegistrationFindFirst.mockReset();
    mockRegistrationUpdate.mockReset();
    mockRegistrationFindFirst.mockImplementation(() => Promise.resolve(null));
    mockRegistrationUpdate.mockImplementation(() =>
      Promise.resolve({ attendedAt: new Date("2026-07-01T00:00:00.000Z") }),
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test("registrationId と eventId の両方で対象申込を絞る", async () => {
    const eventId = "cm0event1234567890123456";
    const registrationId = "cm0reg12345678901234567";

    await expect(
      setEventRegistrationCheckInCommand({
        eventId,
        registrationId,
        attended: true,
      }),
    ).rejects.toThrow("申込が見つかりません");

    expect(mockRegistrationFindFirst).toHaveBeenCalledWith({
      where: {
        id: registrationId,
        eventId,
        event: { deletedAt: null },
      },
      select: {
        id: true,
        eventId: true,
        attendedAt: true,
        status: true,
      },
    });
    expect(mockRegistrationUpdate).not.toHaveBeenCalled();
  });
});
