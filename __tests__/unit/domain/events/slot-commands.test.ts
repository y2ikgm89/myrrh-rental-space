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
  event: { update: ReturnType<typeof mock> };
};

function buildTx(opts: {
  existingSlots?: { id: string; registrations: { id: string }[] }[];
  aggregate?: { min: Date | null; max: Date | null };
}): TxStub {
  return {
    eventTimeSlot: {
      findMany: mock(async () => opts.existingSlots ?? []),
      delete: mock(async () => ({ id: "deleted" })),
      update: mock(async () => ({ id: "updated" })),
      create: mock(async () => ({ id: "created" })),
      aggregate: mock(async () => ({
        _min: { startAt: opts.aggregate?.min ?? null },
        _max: { endAt: opts.aggregate?.max ?? null },
      })),
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

    await syncEventTimeSlotsCommand(tx as never, EVENT_ID, [
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

    await syncEventTimeSlotsCommand(tx as never, EVENT_ID, [
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

    await syncEventTimeSlotsCommand(tx as never, EVENT_ID, [
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

    await syncEventTimeSlotsCommand(tx as never, EVENT_ID, [
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

  test("申込ありスロットを削除しようとすると DomainError 'VALIDATION'", async () => {
    const tx = buildTx({
      existingSlots: [
        { id: "slot-with-reg", registrations: [{ id: "reg-1" }] },
      ],
    });

    await expect(
      syncEventTimeSlotsCommand(tx as never, EVENT_ID, [
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

    await expect(
      syncEventTimeSlotsCommand(tx as never, EVENT_ID, []),
    ).rejects.toThrow(DomainError);
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  test("endAt <= startAt の入力は DomainError 'VALIDATION'", async () => {
    const tx = buildTx({});
    const t = new Date("2026-12-04T10:00:00Z");

    await expect(
      syncEventTimeSlotsCommand(tx as never, EVENT_ID, [
        { startAt: t, endAt: t, capacity: 1 },
      ]),
    ).rejects.toThrow(DomainError);
  });
});
