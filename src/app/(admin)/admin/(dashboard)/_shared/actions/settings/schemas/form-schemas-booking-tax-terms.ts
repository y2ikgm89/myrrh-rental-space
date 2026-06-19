/**
 * 設定セクション用フォームスキーマ — 予約・税
 */
import { z } from "zod";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Site > Payment > 消費税
// =============================================================================

export const taxFormSchema = z.object({
  taxStandardRate: z.number().min(0).max(100),
  taxReducedRate: z.number().min(0).max(100),
  taxDisplayModeAdmin: z.enum(TaxDisplayMode),
  taxDisplayModePublic: z.enum(TaxDisplayMode),
});

export type TaxFormInput = z.infer<typeof taxFormSchema>;

// =============================================================================
// Booking > 予約設定
// =============================================================================

export const reservationFormSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240),
  minReservationDuration: z.number().int().min(15).max(480),
  maxReservationDuration: z.number().int().min(60).max(1440),
  cancellationDeadlineHours: z.number().int().min(1).max(720),
  modificationDeadlineHours: z.number().int().min(1).max(720),
});

export type ReservationFormInput = z.infer<typeof reservationFormSchema>;
