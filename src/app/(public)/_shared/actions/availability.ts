"use server";

import { z } from "zod";
import type { TimeSlot } from "@/shared/lib/reservation/types";
import { getAvailableTimeSlots } from "@/shared/lib/reservation/time-slots";
import {
  getBlockedDateRangesForSpace,
  type BlockedDateRange,
} from "@/shared/domain/reservations/availability";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { publicQueryRateLimiter } from "@/shared/lib/rate-limit";

const fetchSlotsSchema = z.object({
  spaceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const spaceIdSchema = z.string().uuid();

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

/**
 * 公開予約フォームのカレンダー grey-out 用に、スペースの臨時休業
 * （BlockedDate）範囲を取得する。認証不要・レート制限付き（公開読み取り）。
 */
export async function fetchSpaceBlockedDates(
  spaceId: string,
): Promise<BlockedDateRange[]> {
  const rateLimit = await checkActionRateLimit(publicQueryRateLimiter);
  if (!rateLimit.success) return [];

  const parsed = spaceIdSchema.safeParse(spaceId);
  if (!parsed.success) return [];

  return getBlockedDateRangesForSpace(parsed.data);
}
