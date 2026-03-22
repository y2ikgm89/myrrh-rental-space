"use server";

import type { TimeSlot } from "@/shared/lib/reservation/types";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { getAvailableTimeSlots } from "@/shared/lib/reservation/time-slots";
import { getBusinessHoursSettingsQuery } from "@/shared/domain/reservations/availability";

export async function fetchAvailableSlots(
  spaceId: string,
  date: string,
): Promise<TimeSlot[]> {
  if (!spaceId || !date) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  return getAvailableTimeSlots(spaceId, date);
}

export async function fetchBusinessHours(): Promise<BusinessHours | null> {
  return getBusinessHoursSettingsQuery();
}
