import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands/optimistic";

export type ReservationSettingsInput = {
  defaultTimeSlot: number;
  minReservationDuration: number;
  maxReservationDuration: number;
  cancellationDeadlineHours: number;
  modificationDeadlineHours: number;
  customerCanCancelSeriesInFull: boolean;
  maxRecurrenceInstances: number;
  /** 楽観的 concurrency: 読み込み時の SettingsReservation.updatedAt */
  expectedUpdatedAt: string | Date;
};

export async function updateReservationSettings(
  data: ReservationSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);
  const updateData = {
    defaultTimeSlot: data.defaultTimeSlot,
    minReservationDuration: data.minReservationDuration,
    maxReservationDuration: data.maxReservationDuration,
    cancellationDeadlineHours: data.cancellationDeadlineHours,
    modificationDeadlineHours: data.modificationDeadlineHours,
    customerCanCancelSeriesInFull: data.customerCanCancelSeriesInFull,
    maxRecurrenceInstances: data.maxRecurrenceInstances,
  };

  await prisma.$transaction(async (tx) => {
    const result = await tx.settingsReservation.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}
