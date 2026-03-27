import "server-only";

import { prisma } from "@/shared/db/prisma";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import {
  parseBusinessHours,
  type BusinessHours,
} from "@/shared/lib/json-validators";
import type {
  OverlapCheckParams,
  OverlapCheckResult,
  PrismaTransactionClient,
} from "@/shared/lib/reservation/types";

export async function getBusinessHoursSettingsQuery(): Promise<BusinessHours | null> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { businessHours: true },
  });

  if (!settings?.businessHours) {
    return null;
  }

  return parseBusinessHours(settings.businessHours);
}

export async function checkReservationOverlapQuery(
  params: OverlapCheckParams,
  tx?: PrismaTransactionClient,
): Promise<OverlapCheckResult> {
  const { spaceId, startTime, endTime, excludeReservationId } = params;
  const client = tx ?? prisma;

  const overlappingReservation = await client.reservation.findFirst({
    where: {
      spaceId,
      deletedAt: null,
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      ...(excludeReservationId && { id: { not: excludeReservationId } }),
      AND: [{ startTime: { lt: endTime } }, { endTime: { gt: startTime } }],
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  if (!overlappingReservation) {
    return { hasOverlap: false };
  }

  return {
    hasOverlap: true,
    conflictingReservation: overlappingReservation,
  };
}

export async function getReservationsForDateQuery(
  spaceId: string,
  dateStart: Date,
  dateEnd: Date,
): Promise<Array<{ startTime: Date; endTime: Date }>> {
  return prisma.reservation.findMany({
    where: {
      spaceId,
      deletedAt: null,
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      startTime: { gte: dateStart, lte: dateEnd },
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });
}
