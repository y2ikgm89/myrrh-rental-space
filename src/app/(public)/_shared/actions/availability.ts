"use server";

import { z } from "zod";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { getAvailableTimeSlots } from "@/shared/lib/reservation/time-slots";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { publicQueryRateLimiter } from "@/shared/lib/rate-limit";

const fetchSlotsSchema = z.object({
  spaceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function fetchAvailableSlots(
  spaceId: string,
  date: string,
): Promise<TimeSlot[]> {
  const rateLimit = await checkActionRateLimit(publicQueryRateLimiter);
  if (!rateLimit.success) return [];

  const parsed = fetchSlotsSchema.safeParse({ spaceId, date });
  if (!parsed.success) return [];

  return getAvailableTimeSlots(parsed.data.spaceId, parsed.data.date);
}
