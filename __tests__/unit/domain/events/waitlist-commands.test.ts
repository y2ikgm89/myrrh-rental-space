/**
 * waitlist-commands.ts のテスト。
 *
 * `offerNextWaitlistEntryCommand` は tx を module-level mock ではなく引数として
 * 直接渡す設計のため、そのテストは mock.module() 不要（プレーンな jest.fn() スタブを
 * 持つオブジェクトを渡すだけで検証できる）。
 *
 * `confirmWaitlistOfferCommand` / `expireWaitlistOfferCommand` は内部で
 * `prisma.$transaction` を直接呼ぶため、`@/shared/db/prisma` を module mock し、
 * callback に渡す tx スタブを module-level mock 関数で構成する
 * （`registration-commands.test.ts` の `createEventRegistrationCommand` テストと
 * 同型のパターン）。mock.module は静的 import より前に評価する必要があるため、
 * テスト対象は mock.module 宣言後に動的 import する。
 */

import { describe, expect, it, test, jest, mock, beforeEach } from "bun:test";
import {
  PaymentStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";

// ---------------------------------------------------------------------------
// prisma.$transaction mock（confirmWaitlistOfferCommand / expireWaitlistOfferCommand 用）
// ---------------------------------------------------------------------------

const mockRegistrationFindFirst = mock<
  (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockRegistrationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockRegistrationAggregate = mock<
  (
    args: Record<string, unknown>,
  ) => Promise<{ _sum: { quantity: number | null } }>
>(() => Promise.resolve({ _sum: { quantity: null } }));
const mockSlotFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ capacity: number } | null>
>(() => Promise.resolve(null));
// 本番コードは advisory xact lock を tx.$executeRaw で取得する。戻り値（影響行数）は
// 使わないため 0 を返すだけのスタブで足りる（registration-commands.test.ts と同型）。
const mockExecuteRaw = mock<(...args: unknown[]) => Promise<number>>(() =>
  Promise.resolve(0),
);

const txStub = {
  $executeRaw: mockExecuteRaw,
  eventRegistration: {
    findFirst: mockRegistrationFindFirst,
    updateMany: mockRegistrationUpdateMany,
    aggregate: mockRegistrationAggregate,
  },
  eventTimeSlot: {
    findUnique: mockSlotFindUnique,
  },
};

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: (cb: (client: typeof txStub) => Promise<unknown>) =>
      cb(txStub),
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede import
const {
  offerNextWaitlistEntryCommand,
  WAITLIST_OFFER_TTL_MS,
  confirmWaitlistOfferCommand,
  expireWaitlistOfferCommand,
} = await import("@/shared/domain/events/waitlist-commands");

describe("offerNextWaitlistEntryCommand", () => {
  it("no candidate → promoted: null", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const updateMany = jest.fn();
    const tx = {
      eventRegistration: {
        findFirst,
        updateMany,
        findUnique: jest.fn(),
      },
    };
    const now = new Date("2026-07-13T10:00:00Z");
    const result = await offerNextWaitlistEntryCommand(tx, {
      slotId: "slot-1",
      ticketId: "ticket-1",
      now,
    });
    expect(result.promoted).toBeNull();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("FIFO head found → updateMany claim → returns promoted", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: "reg-1", email: "a@b.co" });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const tx = {
      eventRegistration: {
        findFirst,
        updateMany,
        findUnique: jest.fn(),
      },
    };
    const now = new Date("2026-07-13T10:00:00Z");
    const result = await offerNextWaitlistEntryCommand(tx, {
      slotId: "slot-1",
      ticketId: "ticket-1",
      now,
    });
    expect(result.promoted).toEqual({
      id: "reg-1",
      email: "a@b.co",
      offeredAt: now,
      expiresAt: new Date(now.getTime() + WAITLIST_OFFER_TTL_MS),
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slotId: "slot-1",
          ticketId: "ticket-1",
          status: RegistrationStatus.WAITLISTED,
        },
        orderBy: { waitlistedAt: "asc" },
      }),
    );
    // 二重昇格防止の atomic claim: WHERE に id + status: WAITLISTED の両方が
    // 揃っていないと、race で 2 箇所から呼ばれたときに同じ候補を二重に
    // WAITLISTED_OFFERED へ昇格させてしまう（このテストが唯一の安全網）。
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "reg-1",
          status: RegistrationStatus.WAITLISTED,
        }),
        data: expect.objectContaining({
          status: RegistrationStatus.WAITLISTED_OFFERED,
          offeredAt: now,
          expiresAt: new Date(now.getTime() + WAITLIST_OFFER_TTL_MS),
        }),
      }),
    );
  });

  it("candidate found but updateMany count=0 → race lost → null", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: "reg-1", email: "a@b.co" });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const tx = {
      eventRegistration: {
        findFirst,
        updateMany,
        findUnique: jest.fn(),
      },
    };
    const now = new Date();
    const result = await offerNextWaitlistEntryCommand(tx, {
      slotId: "slot-1",
      ticketId: "ticket-1",
      now,
    });
    expect(result.promoted).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// confirmWaitlistOfferCommand — Codex P1-B (PR#1080 レビュー):
// per-ticket capacity recheck
// ---------------------------------------------------------------------------

describe("confirmWaitlistOfferCommand", () => {
  const NOW = new Date("2026-07-13T10:00:00Z");
  const FUTURE_EXPIRES = new Date("2026-07-13T12:00:00Z");

  beforeEach(() => {
    mockRegistrationFindFirst.mockReset();
    mockRegistrationUpdateMany.mockReset();
    mockRegistrationAggregate.mockReset();
    mockSlotFindUnique.mockReset();
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  test("ticket.capacity != null かつ満員 → EXPIRED に遷移し CONFIRMED claim は呼ばれない", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce({
      id: "reg-1",
      eventId: "event-1",
      slotId: "slot-1",
      ticketId: "ticket-1",
      quantity: 1,
      expiresAt: FUTURE_EXPIRES,
      ticket: { capacity: 5 },
    });
    // スロット全体には空きがある（100 capacity - 10 confirmed = 90 remaining）。
    mockSlotFindUnique.mockResolvedValueOnce({ capacity: 100 });
    mockRegistrationAggregate.mockResolvedValueOnce({
      _sum: { quantity: 10 },
    }); // 1回目 = スロット全体の confirmedSum
    // このチケット種別は capacity 5 に対し既に 5 消費済み = 満員 (remaining 0)。
    mockRegistrationAggregate.mockResolvedValueOnce({ _sum: { quantity: 5 } }); // 2回目 = チケット別 confirmedSum
    mockRegistrationUpdateMany.mockResolvedValueOnce({ count: 1 }); // EXPIRED claim 成功

    const result = await confirmWaitlistOfferCommand({
      registrationId: "reg-1",
      now: NOW,
    });

    expect(result.registration).toEqual({ id: "reg-1", status: "EXPIRED" });
    expect(mockRegistrationAggregate).toHaveBeenCalledTimes(2);
    expect(mockRegistrationAggregate.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          slotId: "slot-1",
          ticketId: "ticket-1",
          status: RegistrationStatus.CONFIRMED,
        }),
      }),
    );
    // updateMany は EXPIRED claim の 1 回だけ（CONFIRMED claim には到達しない）。
    expect(mockRegistrationUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockRegistrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "reg-1",
          status: RegistrationStatus.WAITLISTED_OFFERED,
        }),
        data: { status: RegistrationStatus.EXPIRED },
      }),
    );
  });

  test("ticket.capacity != null かつ空きあり → CONFIRMED に遷移する", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce({
      id: "reg-2",
      eventId: "event-1",
      slotId: "slot-1",
      ticketId: "ticket-1",
      quantity: 1,
      expiresAt: FUTURE_EXPIRES,
      ticket: { capacity: 5 },
    });
    mockSlotFindUnique.mockResolvedValueOnce({ capacity: 100 });
    mockRegistrationAggregate.mockResolvedValueOnce({
      _sum: { quantity: 10 },
    }); // スロット
    mockRegistrationAggregate.mockResolvedValueOnce({ _sum: { quantity: 2 } }); // チケット (capacity 5, remaining 3 >= quantity 1)
    mockRegistrationUpdateMany.mockResolvedValueOnce({ count: 1 }); // CONFIRMED claim

    const result = await confirmWaitlistOfferCommand({
      registrationId: "reg-2",
      now: NOW,
    });

    expect(result.registration).toEqual({ id: "reg-2", status: "CONFIRMED" });
    expect(mockRegistrationAggregate).toHaveBeenCalledTimes(2);
    expect(mockRegistrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "reg-2",
          status: RegistrationStatus.WAITLISTED_OFFERED,
        }),
        data: { status: RegistrationStatus.CONFIRMED },
      }),
    );
  });

  test("ticket.capacity === null（無制限）→ per-ticket チェックをスキップして CONFIRMED", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce({
      id: "reg-3",
      eventId: "event-1",
      slotId: "slot-1",
      ticketId: "ticket-1",
      quantity: 1,
      expiresAt: FUTURE_EXPIRES,
      ticket: { capacity: null },
    });
    mockSlotFindUnique.mockResolvedValueOnce({ capacity: 100 });
    mockRegistrationAggregate.mockResolvedValueOnce({
      _sum: { quantity: 10 },
    }); // スロットのみ
    mockRegistrationUpdateMany.mockResolvedValueOnce({ count: 1 }); // CONFIRMED claim

    const result = await confirmWaitlistOfferCommand({
      registrationId: "reg-3",
      now: NOW,
    });

    expect(result.registration).toEqual({ id: "reg-3", status: "CONFIRMED" });
    // capacity: null のチケットは per-ticket aggregate を呼ばない（skip）。
    expect(mockRegistrationAggregate).toHaveBeenCalledTimes(1);
  });

  test("スロット全体が満員の場合は従来どおり EXPIRED（per-ticket チェックより先に判定される回帰確認）", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce({
      id: "reg-4",
      eventId: "event-1",
      slotId: "slot-1",
      ticketId: "ticket-1",
      quantity: 1,
      expiresAt: FUTURE_EXPIRES,
      ticket: { capacity: 5 },
    });
    mockSlotFindUnique.mockResolvedValueOnce({ capacity: 10 });
    mockRegistrationAggregate.mockResolvedValueOnce({
      _sum: { quantity: 10 },
    }); // スロット満員 (remaining 0)
    mockRegistrationUpdateMany.mockResolvedValueOnce({ count: 1 }); // EXPIRED claim

    const result = await confirmWaitlistOfferCommand({
      registrationId: "reg-4",
      now: NOW,
    });

    expect(result.registration).toEqual({ id: "reg-4", status: "EXPIRED" });
    // スロット判定で先に EXPIRED 化するため、per-ticket aggregate には到達しない。
    expect(mockRegistrationAggregate).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// expireWaitlistOfferCommand — Codex P1-C (PR#1080 レビュー):
// paymentStatus: PENDING の対象を admin 手動 expire から保護する
// ---------------------------------------------------------------------------

describe("expireWaitlistOfferCommand", () => {
  const NOW = new Date("2026-07-13T10:00:00Z");

  beforeEach(() => {
    mockRegistrationFindFirst.mockReset();
    mockRegistrationUpdateMany.mockReset();
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  test("paymentStatus: PENDING の対象は DomainError(CONFLICT) を投げ、updateMany は呼ばれない", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce({
      id: "reg-pending",
      eventId: "event-1",
      email: "a@example.com",
      name: "田中太郎",
      paymentStatus: PaymentStatus.PENDING,
    });

    await expect(
      expireWaitlistOfferCommand({ registrationId: "reg-pending", now: NOW }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mockRegistrationUpdateMany).not.toHaveBeenCalled();
  });

  test("paymentStatus: PENDING 以外（UNPAID 等）の対象は通常どおり EXPIRED 化される", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce({
      id: "reg-unpaid",
      eventId: "event-1",
      email: "b@example.com",
      name: "佐藤花子",
      paymentStatus: PaymentStatus.UNPAID,
    });
    mockRegistrationUpdateMany.mockResolvedValueOnce({ count: 1 });

    const result = await expireWaitlistOfferCommand({
      registrationId: "reg-unpaid",
      now: NOW,
    });

    expect(result.registration).toEqual({
      id: "reg-unpaid",
      status: "EXPIRED",
      email: "b@example.com",
      name: "佐藤花子",
    });
    // claim の WHERE にも defense-in-depth で paymentStatus not PENDING が
    // 含まれることを確認する（pre-check とのレースをここでも塞ぐ）。
    expect(mockRegistrationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "reg-unpaid",
          status: RegistrationStatus.WAITLISTED_OFFERED,
          paymentStatus: { not: PaymentStatus.PENDING },
        }),
        data: { status: RegistrationStatus.EXPIRED },
      }),
    );
  });

  test("対象が見つからない（既に WAITLISTED_OFFERED でない）場合は idempotent no-op で null を返す", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce(null);

    const result = await expireWaitlistOfferCommand({
      registrationId: "reg-missing",
      now: NOW,
    });

    expect(result.registration).toBeNull();
    expect(mockRegistrationUpdateMany).not.toHaveBeenCalled();
  });

  test("claim が race で負けた場合（count=0）も idempotent no-op で null を返す", async () => {
    mockRegistrationFindFirst.mockResolvedValueOnce({
      id: "reg-race",
      eventId: "event-1",
      email: "c@example.com",
      name: "鈴木一郎",
      paymentStatus: PaymentStatus.UNPAID,
    });
    mockRegistrationUpdateMany.mockResolvedValueOnce({ count: 0 });

    const result = await expireWaitlistOfferCommand({
      registrationId: "reg-race",
      now: NOW,
    });

    expect(result.registration).toBeNull();
  });
});
