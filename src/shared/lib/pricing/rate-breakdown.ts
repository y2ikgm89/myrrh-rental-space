import { z } from "zod";

export const rateBreakdownSegmentSchema = z.object({
  fromIso: z.string(),
  toIso: z.string(),
  hours: z.number(),
  hourlyPrice: z.number().int(),
  subtotal: z.number().int(),
  ratePlanId: z.string().nullable(),
  ratePlanName: z.string(),
  isHoliday: z.boolean(),
});

export const rateBreakdownSchema = z
  .object({
    schemaVersion: z.literal(1),
    segments: z.array(rateBreakdownSegmentSchema),
    totalHours: z.number(),
    totalBasePrice: z.number().int(),
    holidayFlags: z.record(z.string(), z.literal(true)),
    legacy: z.boolean().optional(),
  })
  .strict();

export type RateBreakdown = z.infer<typeof rateBreakdownSchema>;
export type RateBreakdownSegment = z.infer<typeof rateBreakdownSegmentSchema>;

export function isLegacyRateBreakdown(json: unknown): boolean {
  if (json == null || typeof json !== "object") return true;
  return "legacy" in json && (json as { legacy?: unknown }).legacy === true;
}
