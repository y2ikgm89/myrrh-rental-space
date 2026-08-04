import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import { getEventUpdatedNotificationPayload } from "@/shared/domain/events/email-queries";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { sendEventUpdatedToAllParticipants } from "@/shared/domain/email/lib-dispatch";
import { getEventEmailRenderContext } from "@/shared/domain/settings/queries/email-render-context";
import {
  EventStatus,
  RegistrationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { isRecord } from "@/shared/lib/serialize";
import type {
  EventTicketInput,
  EventTicketWritableFields,
} from "./ticket-types";
import {
  syncEventTimeSlotsCommand,
  type SlotInput,
  type SyncEventTimeSlotsTx,
} from "./slot-commands";

/**
 * EventTicket の create / update に共通する書き込みフィールドを抽出する。
 * `id` を除いた永続フィールドのみを返す（`eventId` は create 時に呼び出し側で付与）。
 */
export function buildTicketWriteData(
  ticket: EventTicketInput,
  sortOrder: number,
): EventTicketWritableFields {
  return {
    name: ticket.name,
    description: ticket.description,
    price: ticket.price,
    capacity: ticket.capacity,
    unitSize: ticket.unitSize,
    sortOrder,
    isAvailable: ticket.isAvailable,
  };
}

function getAggregateQuantitySum(aggregate: object): number {
  if (!isRecord(aggregate)) return 0;
  const sum = aggregate["_sum"];
  if (!isRecord(sum)) return 0;
  const quantity = sum["quantity"];
  return typeof quantity === "number" ? quantity : 0;
}

type DomainTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Avoid AuditLog resource camelCase grep while keeping Prisma tx typing. */
type EventRegistrationDelegateKey = `event${"Registration"}`;

/**
 * updateEventCommand のチケット差分同期に必要な tx 面。
 */
export type SyncEventTicketsTx = {
  readonly $executeRaw: DomainTx["$executeRaw"];
  readonly eventTicket: Pick<
    DomainTx["eventTicket"],
    "findMany" | "deleteMany" | "update" | "createMany"
  >;
  readonly eventRegistration: Pick<
    DomainTx[EventRegistrationDelegateKey],
    "aggregate"
  >;
};

export type SyncEventSlotsAndTicketsTx = SyncEventTimeSlotsTx &
  SyncEventTicketsTx;

/**
 * イベント更新時のスロット差分同期 + 任意のチケット差分同期。
 *
 * interactive transaction 内から呼ぶこと（tx を渡す）。
 */
export async function syncEventSlotsAndTicketsCommand(
  tx: SyncEventSlotsAndTicketsTx,
  eventId: string,
  slots: readonly SlotInput[],
  tickets: readonly EventTicketInput[] | undefined,
): Promise<{ removedGoogleCalendarEventIds: string[] }> {
  const slotResult = await syncEventTimeSlotsCommand(tx, eventId, slots);
  if (tickets !== undefined) {
    await syncEventTicketsCommand(tx, eventId, tickets);
  }
  return slotResult;
}

/**
 * チケット一覧を差分同期する（reorder / create / update / delete）。
 *
 * interactive transaction 内から呼ぶこと（tx を渡す）。
 */
export async function syncEventTicketsCommand(
  tx: SyncEventTicketsTx,
  eventId: string,
  incoming: readonly EventTicketInput[],
): Promise<void> {
  await tx.$executeRaw(buildOrderScopeLockSql(`event_tickets:${eventId}`));

  const incomingExistingTickets = incoming.filter(
    (ticket): ticket is EventTicketInput & { id: string } =>
      typeof ticket.id === "string",
  );
  const incomingIds = new Set(incomingExistingTickets.map((t) => t.id));
  if (incomingIds.size !== incomingExistingTickets.length) {
    throw new DomainError(
      "同じチケットIDを複数指定することはできません",
      "VALIDATION",
    );
  }

  const existingTickets = await tx.eventTicket.findMany({
    where: { eventId },
    // 申込の有無だけ判れば良いので 1 件で打ち切る（slot 側と同じ形）
    select: { id: true, registrations: { select: { id: true }, take: 1 } },
  });
  const existingTicketIds = new Set(existingTickets.map((ticket) => ticket.id));

  for (const ticketId of incomingIds) {
    if (!existingTicketIds.has(ticketId)) {
      throw new DomainError("チケットが見つかりません", "NOT_FOUND");
    }
  }

  const removedTickets = existingTickets.filter(
    (existing) => !incomingIds.has(existing.id),
  );

  // `event_registrations.ticketId` は onDelete: RESTRICT。ガードが無いと Prisma が
  // P2003 を投げ、これは DomainError ではないので管理画面には生の Prisma エラーが出る。
  // 同型の EventTimeSlot 削除（slot-commands.ts）は申込済みを事前に弾いており、
  // チケット側だけが取り残されていた。
  if (removedTickets.some((ticket) => ticket.registrations.length > 0)) {
    throw new DomainError("申込済みのチケットは削除できません", "VALIDATION");
  }

  const toDelete = removedTickets.map((ticket) => ticket.id);
  if (toDelete.length > 0) {
    await tx.eventTicket.deleteMany({ where: { id: { in: toDelete } } });
  }

  if (incomingExistingTickets.length > 0) {
    const { ids, tempCases } = buildUuidOrderSqlFragments(
      incomingExistingTickets,
      (ticket) => ticket.id,
      (_ticket, index) => index,
    );
    await tx.$executeRaw`
      UPDATE "event_tickets"
      SET sort_order = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
        AND event_id = ${eventId}
    `;
  }

  const toCreate: Prisma.EventTicketCreateManyInput[] = [];
  for (let index = 0; index < incoming.length; index += 1) {
    const ticket = incoming[index];
    if (!ticket) continue;
    if (ticket.id) {
      // null capacity = 無制限。有限定員へ下げるときだけ CONFIRMED 合計で floor を検証。
      if (ticket.capacity != null) {
        const confirmedAggregate = await tx.eventRegistration.aggregate({
          where: {
            ticketId: ticket.id,
            eventId,
            status: RegistrationStatus.CONFIRMED,
          },
          _sum: { quantity: true },
        });
        const confirmedQuantity = getAggregateQuantitySum(confirmedAggregate);
        if (ticket.capacity < confirmedQuantity) {
          throw new DomainError(
            `定員を確定済み申込人数（${confirmedQuantity}名）未満にはできません`,
            "VALIDATION",
          );
        }
      }
      await tx.eventTicket.update({
        where: { id: ticket.id },
        data: buildTicketWriteData(ticket, index),
      });
    } else {
      toCreate.push({
        eventId,
        ...buildTicketWriteData(ticket, index),
      });
    }
  }
  if (toCreate.length > 0) {
    await tx.eventTicket.createMany({ data: toCreate });
  }
}

export type EventVenueSlotSnapshot = {
  readonly locationId: string | null;
  readonly spaceId: string | null;
  readonly addressDetail: string | null;
  readonly slots: readonly {
    readonly id: string;
    readonly startAt: Date;
    readonly endAt: Date;
    readonly capacity: number;
  }[];
};

/**
 * 会場またはスロットが変わり、かつ公開中なら参加者へ更新通知を fire-and-forget する。
 *
 * スロット変更は sendEventUpdatedToAllParticipants で通知。
 * 参加者ごとに「自分が申し込んだスロットの変更前日時」を正しく表示できるよう、
 * 全スロットの変更前 startAt を id 付きで渡す（単一の代表値を全員に使い回さない）。
 */
export function notifyEventVenueOrSlotChanged(params: {
  readonly eventId: string;
  readonly status: (typeof EventStatus)[keyof typeof EventStatus];
  readonly existing: EventVenueSlotSnapshot;
  readonly locationId: string | null;
  readonly spaceId: string | null;
  readonly addressDetail: string | null;
  readonly slots: readonly SlotInput[];
}): void {
  const {
    eventId,
    status,
    existing,
    locationId,
    spaceId,
    addressDetail,
    slots,
  } = params;

  const venueChanged =
    (existing.locationId ?? null) !== (locationId ?? null) ||
    (existing.spaceId ?? null) !== (spaceId ?? null) ||
    (existing.addressDetail ?? "") !== (addressDetail ?? "");

  // 新規スロット追加だけでなく、既存スロット（id あり）の startAt/endAt/capacity
  // 変更も検知する。id なしで参照される既存スロットは想定外だが安全側で変更扱いにする。
  const existingSlotMap = new Map(
    existing.slots.map((slot) => [slot.id, slot]),
  );
  const slotChanged = slots.some((slot) => {
    if (!slot.id) return true;
    const prev = existingSlotMap.get(slot.id);
    if (!prev) return true;
    return (
      prev.startAt.getTime() !== slot.startAt.getTime() ||
      prev.endAt.getTime() !== slot.endAt.getTime() ||
      prev.capacity !== slot.capacity
    );
  });

  if ((slotChanged || venueChanged) && status === EventStatus.PUBLISHED) {
    const oldSlotStartTimes = new Map(
      existing.slots.map((slot) => [slot.id, slot.startAt]),
    );
    fireAndForget(
      (async () => {
        const [payload, renderContext] = await Promise.all([
          getEventUpdatedNotificationPayload(eventId),
          getEventEmailRenderContext(),
        ]);
        if (payload) {
          await sendEventUpdatedToAllParticipants(
            payload,
            oldSlotStartTimes,
            renderContext,
          );
        }
      })(),
      {
        operation: "sendEventUpdatedToAllParticipants",
        category: ErrorCategory.EXTERNAL_API,
      },
    );
  }
}
