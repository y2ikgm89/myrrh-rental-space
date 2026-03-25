import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function getReservationDeadlineSettings() {
  const settings = await prisma.settings.findFirstOrThrow({
    select: {
      cancellationDeadlineHours: true,
      modificationDeadlineHours: true,
    },
  });
  return settings;
}
