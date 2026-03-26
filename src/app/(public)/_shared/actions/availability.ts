"use server";

import { z } from "zod";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import type { BusinessHours } from "@/shared/lib/json-validators";
import { getAvailableTimeSlots } from "@/shared/lib/reservation/time-slots";
import { getBusinessHoursSettingsQuery } from "@/shared/domain/reservations/availability";

const fetchSlotsSchema = z.object({
  spaceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function fetchAvailableSlots(
  spaceId: string,
  date: string,
): Promise<TimeSlot[]> {
  const parsed = fetchSlotsSchema.safeParse({ spaceId, date });
  if (!parsed.success) return [];

  return getAvailableTimeSlots(parsed.data.spaceId, parsed.data.date);
}

export async function fetchBusinessHours(): Promise<BusinessHours | null> {
  return getBusinessHoursSettingsQuery();
}
