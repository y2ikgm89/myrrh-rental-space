import "server-only";

import { prisma } from "@/shared/db/prisma";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

export async function getICalFeedRuntimeSettings(): Promise<{
  enabled: boolean;
  includeCustomerInfo: boolean;
}> {
  const settings = await prisma.settings.findFirst({
    select: {
      icalFeedEnabled: true,
      icalFeedIncludeCustomerInfo: true,
    },
  });

  return {
    enabled: settings?.icalFeedEnabled ?? false,
    includeCustomerInfo: settings?.icalFeedIncludeCustomerInfo ?? false,
  };
}

export async function getICalTokenByValue(token: string): Promise<{
  id: string;
  name: string | null;
  spaceId: string | null;
  expiresAt: Date | null;
  spaceName: string | null;
} | null> {
  const record = await prisma.iCalToken.findUnique({
    where: { token },
    include: {
      space: { select: { name: true } },
    },
  });

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    spaceId: record.spaceId,
    expiresAt: record.expiresAt,
    spaceName: record.space?.name ?? null,
  };
}

export async function getICalReservations(input: {
  rangeStart: Date;
  rangeEnd: Date;
  spaceId?: string | null;
}): Promise<
  Array<{
    id: string;
    startTime: Date;
    endTime: Date;
    spaceName: string;
    spaceAddress: string | null;
    customerFirstName: string;
    customerLastName: string;
  }>
> {
  const reservations = await prisma.reservation.findMany({
    where: {
      status: { in: [...ACTIVE_RESERVATION_STATUSES] },
      startTime: { lt: input.rangeEnd },
      endTime: { gt: input.rangeStart },
      ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    },
    include: {
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
      customer: { select: { firstName: true, lastName: true } },
    },
    orderBy: { startTime: "asc" },
    take: 500,
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    spaceName: reservation.space.name,
    spaceAddress: formatSpaceLineAddress(
      reservation.space.location.address,
      reservation.space.addressDetail,
    ),
    customerFirstName: reservation.customer.firstName,
    customerLastName: reservation.customer.lastName,
  }));
}
