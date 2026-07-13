import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { PrismaTransactionClient } from "@/shared/lib/reservation/types";

/**
 * Space スケジュール空間を占有するアクティブな EventStatus。
 *
 * DRAFT / PUBLISHED のみが Space を占有し、CANCELLED / ARCHIVED は占有しない。
 * この定義は DB 側の CONSTRAINT TRIGGER
 * (`check_event_slot_no_reservation_overlap` /
 *  `check_reservation_no_event_slot_overlap`, migration 20260713044626)
 * の `event_status NOT IN ('DRAFT', 'PUBLISHED') → return NEW` 短絡と揃える。
 * ここを変えた場合は migration 側 SQL の status リストも同時に更新すること。
 */
export const ACTIVE_EVENT_STATUSES: readonly EventStatus[] = [
  EventStatus.DRAFT,
  EventStatus.PUBLISHED,
];

/**
 * 引数の EventStatus が Space を占有するアクティブ状態かを判定する。
 * `checkSpaceOverlap` を呼ぶ書込経路 (createEventCommand / updateEventCommand) で、
 * CANCELLED / ARCHIVED への遷移では overlap 検査を skip するために使う
 * (Space を占有しない terminal 状態には検査不要 — DB trigger と揃える)。
 */
export function isActiveEventStatus(status: EventStatus): boolean {
  return ACTIVE_EVENT_STATUSES.includes(status);
}

export type SpaceOverlapParams = {
  spaceId: string;
  startTime: Date;
  endTime: Date;
  /** Reservation の更新経路で自身を除外するため。 */
  excludeReservationId?: string | undefined;
  /** Event slot の更新経路で自スロットを除外するため。 */
  excludeEventSlotId?: string | undefined;
  /** Event 書込経路で自イベント配下のスロット全てを除外するため (updateEvent の slot diff sync など)。 */
  excludeEventId?: string | undefined;
};

export type SpaceOverlapResult =
  | { hasOverlap: false }
  | {
      hasOverlap: true;
      type: "reservation" | "event";
      conflictId: string;
      startTime: Date;
      endTime: Date;
    };

/**
 * 同一 Space 上での時間帯重複を Reservation と EventTimeSlot の両方で検査する SSoT。
 *
 * 業務不変条件: Space は「時間帯 = 排他資源」であり、Reservation と Event の
 * どちらも同時にはその Space を占有できない。旧実装は Reservation-only の
 * `checkReservationOverlapQuery` しかなく、Event 側書込は Reservation を検査せず、
 * Reservation 側書込は Event を検査しない cross-table race を放置していた
 * (Priority-10 audit #4)。
 *
 * 使用契約:
 * - `tx` を渡すこと (interactive transaction 内の呼出)。かつ呼出前に
 *   `lockSpaceForTransaction(tx, spaceId)` を必ず取得する
 *   (Space 単位の advisory lock で並列書込を serialize)。
 * - 半開区間 `startTime < endTime AND endTime > startTime` で判定する
 *   (隣接ケース = 同一境界時刻は重複扱いしない)。
 * - Event 側は `EventStatus IN (DRAFT, PUBLISHED)` の生きたスロットのみ検査
 *   (CLOSED/DELETED は除外)。
 */
export async function checkSpaceOverlap(
  params: SpaceOverlapParams,
  tx?: PrismaTransactionClient,
): Promise<SpaceOverlapResult> {
  const {
    spaceId,
    startTime,
    endTime,
    excludeReservationId,
    excludeEventSlotId,
    excludeEventId,
  } = params;
  const client = tx ?? prisma;

  // 1. Reservation との重複
  const overlappingReservation = await client.reservation.findFirst({
    where: {
      spaceId,
      deletedAt: null,
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      ...(excludeReservationId && { id: { not: excludeReservationId } }),
      AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
    },
    select: { id: true, startTime: true, endTime: true },
  });
  if (overlappingReservation) {
    return {
      hasOverlap: true,
      type: "reservation",
      conflictId: overlappingReservation.id,
      startTime: overlappingReservation.startTime,
      endTime: overlappingReservation.endTime,
    };
  }

  // 2. Event (EventTimeSlot) との重複
  //    Event.spaceId でスコープし、EventStatus が生きているスロットのみ対象。
  const overlappingSlot = await client.eventTimeSlot.findFirst({
    where: {
      ...(excludeEventSlotId && { id: { not: excludeEventSlotId } }),
      event: {
        spaceId,
        deletedAt: null,
        status: { in: [...ACTIVE_EVENT_STATUSES] },
        ...(excludeEventId && { id: { not: excludeEventId } }),
      },
      AND: [{ startAt: { lt: endTime } }, { endAt: { gt: startTime } }],
    },
    select: { id: true, startAt: true, endAt: true },
  });
  if (overlappingSlot) {
    return {
      hasOverlap: true,
      type: "event",
      conflictId: overlappingSlot.id,
      startTime: overlappingSlot.startAt,
      endTime: overlappingSlot.endAt,
    };
  }

  return { hasOverlap: false };
}
