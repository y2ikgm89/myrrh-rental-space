import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import { isRecord } from "@/shared/lib/serialize";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

export interface SyncEventTimeSlotsTx {
  readonly eventTimeSlot: {
    findMany(args: object): Promise<
      {
        id: string;
        googleCalendarEventId: string | null;
        registrations?: { id: string }[];
      }[]
    >;
    delete(args: object): Promise<unknown>;
    update(args: object): Promise<unknown>;
    create(args: object): Promise<unknown>;
    aggregate(args: object): Promise<object>;
  };
  readonly eventRegistration: {
    aggregate(args: object): Promise<object>;
  };
  readonly event: {
    update(args: object): Promise<unknown>;
  };
}

export interface SlotInput {
  /** 既存スロットの更新時に指定。新規作成時は undefined。 */
  id?: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
}

function getAggregateDate(
  aggregate: object,
  groupKey: "_min" | "_max",
  fieldKey: "startAt" | "endAt",
): Date | null {
  if (!isRecord(aggregate)) return null;
  const group = aggregate[groupKey];
  if (!isRecord(group)) return null;
  const value = group[fieldKey];
  return value instanceof Date ? value : null;
}

function getAggregateQuantitySum(aggregate: object): number {
  if (!isRecord(aggregate)) return 0;
  const sum = aggregate["_sum"];
  if (!isRecord(sum)) return 0;
  const quantity = sum["quantity"];
  return typeof quantity === "number" ? quantity : 0;
}

/**
 * イベントのスロット一覧を差分同期する。
 *
 * - id あり → 既存スロット update
 * - id なし → 新規 create
 * - DB にあるが inputs に含まれない → 申込があれば DomainError、なければ delete
 *
 * interactive transaction 内から呼ぶこと（tx を渡す）。
 * 重複時刻は DB の @@unique([eventId, startAt]) が最終防衛線。
 *
 * 削除されたスロットが `googleCalendarEventId` を持っていた場合、そのまま
 * DB から消すと GCal 側にイベントが孤児として残る (outbound gap)。呼出側
 * (`updateEventCommand`) が tx commit 後に `deleteEventCalendarSync` を発火
 * できるよう、削除対象スロットの `googleCalendarEventId` を戻り値で返す。
 */
export async function syncEventTimeSlotsCommand(
  tx: SyncEventTimeSlotsTx,
  eventId: string,
  inputs: readonly SlotInput[],
): Promise<{ removedGoogleCalendarEventIds: string[] }> {
  if (inputs.length === 0) {
    throw new DomainError(
      "スロットを少なくとも1件登録してください",
      "VALIDATION",
    );
  }

  for (const slot of inputs) {
    if (slot.endAt <= slot.startAt) {
      throw new DomainError(
        "終了時刻は開始時刻より後である必要があります",
        "VALIDATION",
      );
    }
    if (slot.capacity < 1) {
      throw new DomainError("定員は1以上です", "VALIDATION");
    }
  }

  const existingSlots = await tx.eventTimeSlot.findMany({
    where: { eventId },
    select: {
      id: true,
      googleCalendarEventId: true,
      registrations: { select: { id: true }, take: 1 },
    },
  });
  const existingSlotIds = new Set(existingSlots.map((slot) => slot.id));

  const incomingIds = new Set(
    inputs.flatMap((s) => (s.id != null ? [s.id] : [])),
  );

  // 所有権: updateEventCommand のチケット ownership と同型。
  // eventId スコープ外 / 未知の slot.id は update 前に拒否する。
  for (const slot of inputs) {
    if (slot.id != null && !existingSlotIds.has(slot.id)) {
      throw new DomainError("スロットが見つかりません", "NOT_FOUND");
    }
  }

  // 削除対象: 既存スロットのうち incoming に含まれないもの
  const removedGoogleCalendarEventIds: string[] = [];
  for (const existing of existingSlots) {
    if (!incomingIds.has(existing.id)) {
      if ((existing.registrations?.length ?? 0) > 0) {
        throw new DomainError(
          "申込済みのスロットは削除できません",
          "VALIDATION",
        );
      }
      await tx.eventTimeSlot.delete({ where: { id: existing.id } });
      if (existing.googleCalendarEventId !== null) {
        removedGoogleCalendarEventIds.push(existing.googleCalendarEventId);
      }
    }
  }

  for (const slot of inputs) {
    if (slot.id) {
      const confirmedAggregate = await tx.eventRegistration.aggregate({
        where: {
          slotId: slot.id,
          status: RegistrationStatus.CONFIRMED,
        },
        _sum: { quantity: true },
      });
      const confirmedQuantity = getAggregateQuantitySum(confirmedAggregate);
      if (slot.capacity < confirmedQuantity) {
        throw new DomainError(
          `定員を確定済み申込人数（${confirmedQuantity}名）未満にはできません`,
          "VALIDATION",
        );
      }

      await tx.eventTimeSlot.update({
        where: { id: slot.id },
        data: {
          startAt: slot.startAt,
          endAt: slot.endAt,
          capacity: slot.capacity,
        },
      });
    } else {
      await tx.eventTimeSlot.create({
        data: {
          eventId,
          startAt: slot.startAt,
          endAt: slot.endAt,
          capacity: slot.capacity,
        },
      });
    }
  }

  // firstSlotStartAt / lastSlotEndAt 非正規化列を同期（ORDER BY 用）
  // MIN + MAX を 1 クエリで取得。スロット 0 件時は集約値が null。
  const aggregate = await tx.eventTimeSlot.aggregate({
    where: { eventId },
    _min: { startAt: true },
    _max: { endAt: true },
  });
  await tx.event.update({
    where: { id: eventId },
    data: {
      firstSlotStartAt: getAggregateDate(aggregate, "_min", "startAt"),
      lastSlotEndAt: getAggregateDate(aggregate, "_max", "endAt"),
    },
  });

  return { removedGoogleCalendarEventIds };
}
