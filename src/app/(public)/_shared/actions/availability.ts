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
  spaceId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const spaceIdSchema = z.uuid();

/**
 * 時間枠取得の結果。`ok:false`（レート制限/不正入力による取得失敗）と
 * `ok:true` かつ空配列（=その日は本当に枠が無い）を呼び出し側で区別できるよう、
 * 空配列のフォールバックではなく判別可能なユニオンを返す。
 */
export type FetchSlotsResult =
  | { readonly ok: true; readonly slots: TimeSlot[] }
  | { readonly ok: false; readonly reason: "rate_limit" | "invalid" };

export async function fetchAvailableSlots(
  spaceId: string,
  date: string,
): Promise<FetchSlotsResult> {
  const rateLimit = await checkActionRateLimit(publicQueryRateLimiter);
  if (!rateLimit.success) return { ok: false, reason: "rate_limit" };

  const parsed = fetchSlotsSchema.safeParse({ spaceId, date });
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const slots = await getAvailableTimeSlots(
    parsed.data.spaceId,
    parsed.data.date,
  );
  return { ok: true, slots };
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
