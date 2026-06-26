import "server-only";

import type { AppPrismaClient } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

/** 拡張済み AppPrismaClient の interactive transaction client 型 */
type AppTx = Parameters<Parameters<AppPrismaClient["$transaction"]>[0]>[0];

export interface SlotInput {
  /** 既存スロットの更新時に指定。新規作成時は undefined。 */
  id?: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
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
 */
export async function syncEventTimeSlotsCommand(
  tx: AppTx,
  eventId: string,
  inputs: readonly SlotInput[],
): Promise<void> {
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
    if (slot.capacity < 0) {
      throw new DomainError("定員は0以上です", "VALIDATION");
    }
  }

  const existingSlots = await tx.eventTimeSlot.findMany({
    where: { eventId },
    select: { id: true, registrations: { select: { id: true }, take: 1 } },
  });

  const incomingIds = new Set(
    inputs.flatMap((s) => (s.id != null ? [s.id] : [])),
  );

  // 削除対象: 既存スロットのうち incoming に含まれないもの
  for (const existing of existingSlots) {
    if (!incomingIds.has(existing.id)) {
      if (existing.registrations.length > 0) {
        throw new DomainError(
          "申込済みのスロットは削除できません",
          "VALIDATION",
        );
      }
      await tx.eventTimeSlot.delete({ where: { id: existing.id } });
    }
  }

  for (const slot of inputs) {
    if (slot.id) {
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
}
