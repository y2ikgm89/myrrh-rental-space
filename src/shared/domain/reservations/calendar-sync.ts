import "server-only";

import { prisma } from "@/shared/db/prisma";
import { CalendarSyncMethod, ReservationStatus } from "@/shared/db/enums";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

export type FailedCalendarSyncReservation = {
  id: string;
  startTime: Date;
  endTime: Date;
  notes: string | null;
  totalPrice: number | null;
  space: {
    name: string;
    lineAddress: string;
  };
  customer: {
    firstName: string;
    lastName: string;
    email: string;
  };
};

export type CalendarSyncReservationRecord = {
  id: string;
  status: ReservationStatus;
  startTime: Date;
  endTime: Date;
  calendarSyncedAt: Date | null;
  spaceId: string;
  notes: string | null;
  space: {
    name: string;
  };
  customer: {
    lastName: string;
    firstName: string;
    email: string;
  };
};

export async function markReservationCalendarSyncSuccess(input: {
  reservationId: string;
  eventId: string;
}): Promise<void> {
  await prisma.reservation.update({
    where: { id: input.reservationId },
    data: {
      googleCalendarEventId: input.eventId,
      calendarSyncedAt: new Date(),
      calendarSyncError: null,
    },
  });
}

export async function markReservationCalendarSyncUpdated(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      calendarSyncedAt: new Date(),
      calendarSyncError: null,
    },
  });
}

export async function markReservationCalendarSyncError(input: {
  reservationId: string;
  error: string;
}): Promise<void> {
  await prisma.reservation.update({
    where: { id: input.reservationId },
    data: {
      calendarSyncError: input.error,
    },
  });
}

export async function clearReservationCalendarEvent(
  reservationId: string,
): Promise<void> {
  await prisma.reservation.update({
    where: { id: reservationId },
    data: {
      googleCalendarEventId: null,
      calendarSyncError: null,
    },
  });
}

export async function saveReservationOAuthCalendarEvent(input: {
  reservationId: string;
  eventId: string;
}): Promise<void> {
  await prisma.reservation.update({
    where: { id: input.reservationId },
    data: {
      googleCalendarOAuthEventId: input.eventId,
    },
  });
}

export async function getFailedCalendarSyncReservations(
  limit: number = 50,
): Promise<FailedCalendarSyncReservation[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      googleCalendarEventId: null,
      calendarSyncError: { not: null },
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      notes: true,
      totalPrice: true,
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
      customer: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    startTime: r.startTime,
    endTime: r.endTime,
    notes: r.notes,
    totalPrice: r.totalPrice,
    space: {
      name: r.space.name,
      lineAddress: formatSpaceLineAddress(
        r.space.location.address,
        r.space.addressDetail,
      ),
    },
    customer: r.customer,
  }));
}

export async function getCalendarSyncRuntimeState(): Promise<{
  twoWaySyncEnabled: boolean;
  syncToken: string | null;
  lastSyncedAt: Date | null;
  syncMethod: CalendarSyncMethod;
  webhookChannelId: string | null;
  webhookExpiration: Date | null;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarLastSyncedAt: true,
      googleCalendarSyncToken: true,
      googleCalendarTwoWaySyncEnabled: true,
      googleCalendarSyncMethod: true,
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookExpiration: true,
    },
  });

  return {
    twoWaySyncEnabled: settings?.googleCalendarTwoWaySyncEnabled ?? false,
    syncToken: settings?.googleCalendarSyncToken ?? null,
    lastSyncedAt: settings?.googleCalendarLastSyncedAt ?? null,
    syncMethod:
      settings?.googleCalendarSyncMethod ?? CalendarSyncMethod.polling,
    webhookChannelId: settings?.googleCalendarWebhookChannelId ?? null,
    webhookExpiration: settings?.googleCalendarWebhookExpiration ?? null,
  };
}

export async function recordCalendarSyncStarted(): Promise<void> {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: { googleCalendarLastSyncedAt: new Date() },
  });
}

export async function saveCalendarSyncToken(syncToken: string): Promise<void> {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarSyncToken: syncToken,
    },
  });
}

export async function getReservationByCalendarEventId(
  eventId: string,
): Promise<CalendarSyncReservationRecord | null> {
  return prisma.reservation.findFirst({
    where: {
      googleCalendarEventId: eventId,
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      calendarSyncedAt: true,
      spaceId: true,
      notes: true,
      space: { select: { name: true } },
      customer: {
        select: {
          lastName: true,
          firstName: true,
          email: true,
        },
      },
    },
  });
}

export async function cancelReservationFromCalendar(input: {
  reservationId: string;
  existingNotes: string | null;
}): Promise<void> {
  const syncNote = `[Google Calendarで削除] ${new Date().toLocaleString("ja-JP")}`;
  const newNotes = input.existingNotes
    ? `${input.existingNotes}\n${syncNote}`
    : syncNote;

  await prisma.reservation.update({
    where: { id: input.reservationId },
    data: {
      status: ReservationStatus.CANCELLED,
      googleCalendarEventId: null,
      calendarSyncedAt: new Date(),
      notes: newNotes,
    },
  });
}

export async function applyCalendarTimeChange(input: {
  reservationId: string;
  spaceId: string;
  existingNotes: string | null;
  startTime: Date;
  endTime: Date;
}): Promise<
  | { success: true }
  | {
      success: false;
      conflictingReservation: {
        id: string;
        startTime: Date;
        endTime: Date;
      };
    }
> {
  return prisma.$transaction(async (tx) => {
    const overlappingReservation = await tx.reservation.findFirst({
      where: {
        spaceId: input.spaceId,
        status: { in: [...ACTIVE_RESERVATION_STATUSES] },
        id: { not: input.reservationId },
        AND: [
          { startTime: { lt: input.endTime } },
          { endTime: { gt: input.startTime } },
        ],
      },
      select: { id: true, startTime: true, endTime: true },
    });

    if (overlappingReservation) {
      const rejectionNote =
        `[カレンダー同期エラー] ${new Date().toLocaleString("ja-JP")}\n` +
        `時間変更が重複のため拒否されました。\n` +
        `試行時間: ${input.startTime.toLocaleString("ja-JP")} - ${input.endTime.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}\n` +
        `重複予約ID: ${overlappingReservation.id.slice(0, 8).toUpperCase()}`;

      const newNotes = input.existingNotes
        ? `${input.existingNotes}\n\n${rejectionNote}`
        : rejectionNote;

      await tx.reservation.update({
        where: { id: input.reservationId },
        data: {
          notes: newNotes,
          calendarSyncError: "Time change rejected: overlapping reservation",
        },
      });

      return {
        success: false as const,
        conflictingReservation: overlappingReservation,
      };
    }

    await tx.reservation.update({
      where: { id: input.reservationId },
      data: {
        startTime: input.startTime,
        endTime: input.endTime,
        calendarSyncedAt: new Date(),
        calendarSyncError: null,
      },
    });

    return { success: true as const };
  });
}
