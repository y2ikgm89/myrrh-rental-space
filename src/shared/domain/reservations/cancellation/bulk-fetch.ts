import "server-only";

import { prisma } from "@/shared/db/prisma";

interface SeriesInfoForBulkEmail {
  customer: {
    lastName: string;
    firstName: string;
    email: string;
  };
  space: {
    name: string;
  };
}

export async function fetchSeriesForBulkEmail(
  seriesId: string,
): Promise<SeriesInfoForBulkEmail | null> {
  return prisma.reservationSeries.findUnique({
    where: { id: seriesId },
    select: {
      customer: { select: { lastName: true, firstName: true, email: true } },
      space: { select: { name: true } },
    },
  });
}

export async function fetchInstancesForBulkEmail(
  reservationIds: string[],
): Promise<{ startTime: Date; endTime: Date }[]> {
  if (reservationIds.length === 0) return [];
  return prisma.reservation.findMany({
    where: { id: { in: reservationIds } },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });
}
