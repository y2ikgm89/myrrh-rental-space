import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

import { syncEventTimeSlotsCommand } from "@/shared/domain/events/slot-commands";
import { DomainError } from "@/shared/domain/domain-error";

type TxStub = {
  eventTimeSlot: {
    findMany: ReturnType<typeof mock>;
    delete: ReturnType<typeof mock>;
    update: ReturnType<typeof mock>;
    create: ReturnType<typeof mock>;
    aggregate: ReturnType<typeof mock>;
  };
  eventRegistration: {
    aggregate: ReturnType<typeof mock>;
  };
  event: { update: ReturnType<typeof mock> };
};

function buildTx(opts: {
  existingSlots?: {
    id: string;
    registrations: { id: string }[];
    googleCalendarEventId?: string | null;
  }[];
  aggregate?: { min: Date | null; max: Date | null };
  confirmedQuantityBySlotId?: Record<string, number>;
}): TxStub {
  return {
    eventTimeSlot: {
      findMany: mock(async () =>
        (opts.existingSlots ?? []).map((s) => ({
          ...s,
          googleCalendarEventId: s.googleCalendarEventId ?? null,
        })),
      ),
      delete: mock(async () => ({ id: "deleted" })),
      update: mock(async () => ({ id: "updated" })),
      create: mock(async () => ({ id: "created" })),
      aggregate: mock(async () => ({
        _min: { startAt: opts.aggregate?.min ?? null },
        _max: { endAt: opts.aggregate?.max ?? null },
      })),
    },
    eventRegistration: {
      aggregate: mock(async (args: { where?: { slotId?: string } }) => {
        const slotId = args.where?.slotId;
        const quantity =
          slotId !== undefined
            ? (opts.confirmedQuantityBySlotId?.[slotId] ?? 0)
            : 0;
        return { _sum: { quantity } };
      }),
    },
    event: { update: mock(async () => ({ id: "event-1" })) },
  };
}

const EVENT_ID = "event-1";

describe("syncEventTimeSlotsCommand — firstSlotStartAt/lastSlotEndAt 同期", () => {
  beforeEach(() => {
    // Bun mock は test 毎にインスタンス再生成するため明示 reset 不要
  });

  test("単一新規スロットを追加すると Event.firstSlotStartAt = startAt / lastSlotEndAt = endAt", async () => {
    const startAt = new Date("2026-12-01T10:00:00Z");
    const endAt = new Date("2026-12-01T12:00:00Z");
    const tx = buildTx({ aggregate: { min: startAt, max: endAt } });

    await syncEventTimeSlotsCommand(tx, EVENT_ID, [
      { startAt, endAt, capacity: 30 },
    ]);

    expect(tx.eventTimeSlot.create).toHaveBeenCalledTimes(1);
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
      data: { firstSlotStartAt: startAt, lastSlotEndAt: endAt },
    });
  });

  test("複数スロット (順不同) でも MIN(startAt) / MAX(endAt) が選定される", async () => {
    const earliest = new Date("2026-12-01T09:00:00Z");
    const earliestEnd = new Date("2026-12-01T11:00:00Z");
    const middle = new Date("2026-12-01T13:00:00Z");
    const middleEnd = new Date("2026-12-01T15:00:00Z");
    const latest = new Date("2026-12-01T17:00:00Z");
    const latestEnd = new Date("2026-12-01T19:00:00Z");
    // aggregate は DB 側で MIN/MAX を計算するため、mock は集約結果を返す
    const tx = buildTx({ aggregate: { min: earliest, max: latestEnd } });

    await syncEventTimeSlotsCommand(tx, EVENT_ID, [
      { startAt: middle, endAt: middleEnd, capacity: 10 },
      { startAt: latest, endAt: latestEnd, capacity: 10 },
      { startAt: earliest, endAt: earliestEnd, capacity: 10 },
    ]);

    expect(tx.eventTimeSlot.create).toHaveBeenCalledTimes(3);
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
      data: { firstSlotStartAt: earliest, lastSlotEndAt: latestEnd },
    });
  });

  test("既存スロット時刻を後ろにずらすと aggregate 経由で firstSlotStartAt が追従", async () => {
    const newStart = new Date("2026-12-01T14:00:00Z");
    const newEnd = new Date("2026-12-01T16:00:00Z");
    const tx = buildTx({
      existingSlots: [{ id: "slot-1", registrations: [] }],
      aggregate: { min: newStart, max: newEnd },
    });

    await syncEventTimeSlotsCommand(tx, EVENT_ID, [
      { id: "slot-1", startAt: newStart, endAt: newEnd, capacity: 20 },
    ]);

    expect(tx.eventTimeSlot.update).toHaveBeenCalledWith({
      where: { id: "slot-1" },
      data: { startAt: newStart, endAt: newEnd, capacity: 20 },
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
      data: { firstSlotStartAt: newStart, lastSlotEndAt: newEnd },
    });
  });

  test("スロット 1 件削除 (残スロットあり) で残スロットの MIN/MAX に更新", async () => {
    const remainStart = new Date("2026-12-02T10:00:00Z");
    const remainEnd = new Date("2026-12-02T12:00:00Z");
    const tx = buildTx({
      existingSlots: [
        { id: "slot-1", registrations: [] }, // 削除対象 (inputs に含めない)
        { id: "slot-2", registrations: [] }, // 残す
      ],
      aggregate: { min: remainStart, max: remainEnd },
    });

    await syncEventTimeSlotsCommand(tx, EVENT_ID, [
      { id: "slot-2", startAt: remainStart, endAt: remainEnd, capacity: 10 },
    ]);

    expect(tx.eventTimeSlot.delete).toHaveBeenCalledWith({
      where: { id: "slot-1" },
    });
    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: EVENT_ID },
      data: { firstSlotStartAt: remainStart, lastSlotEndAt: remainEnd },
    });
  });

  // GCAL-OUTBOUND-02: 削除されたスロットが googleCalendarEventId を持つ場合、
  // 呼出側 (updateEventCommand) が GCal 側の孤児イベントを削除できるよう
  // removedGoogleCalendarEventIds として返す。
  test("GCal 同期済みスロットを削除すると removedGoogleCalendarEventIds に含まれる", async () => {
    const remainStart = new Date("2026-12-02T10:00:00Z");
    const remainEnd = new Date("2026-12-02T12:00:00Z");
    const tx = buildTx({
      existingSlots: [
        {
          id: "slot-synced",
          registrations: [],
          googleCalendarEventId: "gcal-event-abc",
        },
        { id: "slot-2", registrations: [], googleCalendarEventId: null },
      ],
      aggregate: { min: remainStart, max: remainEnd },
    });

    const result = await syncEventTimeSlotsCommand(tx, EVENT_ID, [
      { id: "slot-2", startAt: remainStart, endAt: remainEnd, capacity: 10 },
    ]);

    expect(tx.eventTimeSlot.delete).toHaveBeenCalledWith({
      where: { id: "slot-synced" },
    });
    expect(result.removedGoogleCalendarEventIds).toEqual(["gcal-event-abc"]);
  });

  test("GCal 未同期のスロット削除では removedGoogleCalendarEventIds が空", async () => {
    const remainStart = new Date("2026-12-02T10:00:00Z");
    const remainEnd = new Date("2026-12-02T12:00:00Z");
    const tx = buildTx({
      existingSlots: [
        { id: "slot-1", registrations: [], googleCalendarEventId: null },
        { id: "slot-2", registrations: [] },
      ],
      aggregate: { min: remainStart, max: remainEnd },
    });

    const result = await syncEventTimeSlotsCommand(tx, EVENT_ID, [
      { id: "slot-2", startAt: remainStart, endAt: remainEnd, capacity: 10 },
    ]);

    expect(result.removedGoogleCalendarEventIds).toEqual([]);
  });

  test("申込ありスロットを削除しようとすると DomainError 'VALIDATION'", async () => {
    const tx = buildTx({
      existingSlots: [
        { id: "slot-with-reg", registrations: [{ id: "reg-1" }] },
      ],
    });

    await expect(
      syncEventTimeSlotsCommand(tx, EVENT_ID, [
        {
          startAt: new Date("2026-12-03T10:00:00Z"),
          endAt: new Date("2026-12-03T12:00:00Z"),
          capacity: 5,
        },
      ]),
    ).rejects.toThrow(DomainError);
    expect(tx.eventTimeSlot.delete).not.toHaveBeenCalled();
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  test("inputs が空配列だと DomainError 'VALIDATION' で event.update も呼ばれない", async () => {
    const tx = buildTx({});

    await expect(syncEventTimeSlotsCommand(tx, EVENT_ID, [])).rejects.toThrow(
      DomainError,
    );
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  test("endAt <= startAt の入力は DomainError 'VALIDATION'", async () => {
    const tx = buildTx({});
    const t = new Date("2026-12-04T10:00:00Z");

    await expect(
      syncEventTimeSlotsCommand(tx, EVENT_ID, [
        { startAt: t, endAt: t, capacity: 1 },
      ]),
    ).rejects.toThrow(DomainError);
  });

  test("capacity が 0 の入力は DomainError 'VALIDATION'", async () => {
    const tx = buildTx({});

    await expect(
      syncEventTimeSlotsCommand(tx, EVENT_ID, [
        {
          startAt: new Date("2026-12-04T10:00:00Z"),
          endAt: new Date("2026-12-04T11:00:00Z"),
          capacity: 0,
        },
      ]),
    ).rejects.toThrow(DomainError);
    expect(tx.eventTimeSlot.create).not.toHaveBeenCalled();
  });

  test("確定済み申込人数より定員を下げると DomainError 'VALIDATION'", async () => {
    const startAt = new Date("2026-12-05T10:00:00Z");
    const endAt = new Date("2026-12-05T12:00:00Z");
    const tx = buildTx({
      existingSlots: [{ id: "slot-1", registrations: [{ id: "reg-1" }] }],
      confirmedQuantityBySlotId: { "slot-1": 5 },
    });

    await expect(
      syncEventTimeSlotsCommand(tx, EVENT_ID, [
        { id: "slot-1", startAt, endAt, capacity: 4 },
      ]),
    ).rejects.toThrow(DomainError);

    expect(tx.eventTimeSlot.update).not.toHaveBeenCalled();
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  test("他イベントの slot.id や未知 id は DomainError 'NOT_FOUND'", async () => {
    const startAt = new Date("2026-12-06T10:00:00Z");
    const endAt = new Date("2026-12-06T12:00:00Z");
    const tx = buildTx({
      existingSlots: [{ id: "slot-owned", registrations: [] }],
    });

    await expect(
      syncEventTimeSlotsCommand(tx, EVENT_ID, [
        { id: "slot-foreign", startAt, endAt, capacity: 10 },
      ]),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "スロットが見つかりません",
    });

    expect(tx.eventTimeSlot.update).not.toHaveBeenCalled();
    expect(tx.eventTimeSlot.create).not.toHaveBeenCalled();
    expect(tx.event.update).not.toHaveBeenCalled();
  });
});
