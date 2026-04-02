/**
 * 設定セクション用フォームスキーマ — 予約・税・規約同意
 */
import { z } from "zod";
import { TaxDisplayMode, TaxInputMode } from "@generated/prisma/enums";

// =============================================================================
// Site > Payment > 消費税
// =============================================================================

export const taxFormSchema = z.object({
  taxStandardRate: z.number().min(0).max(100),
  taxReducedRate: z.number().min(0).max(100),
  taxDisplayModeAdmin: z.enum(TaxDisplayMode),
  taxDisplayModePublic: z.enum(TaxDisplayMode),
  taxInputMode: z.enum(TaxInputMode),
});

export type TaxFormInput = z.infer<typeof taxFormSchema>;

// =============================================================================
// Site > Booking > 規約同意
// =============================================================================

export const termsAgreementFormSchema = z.object({
  termsAgreementEnabled: z.boolean(),
  termsAgreementText: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  requireTermsAgreement: z.boolean(),
  requirePrivacyAgreement: z.boolean(),
});

export type TermsAgreementFormInput = z.infer<typeof termsAgreementFormSchema>;

// =============================================================================
// Booking > 予約設定
// =============================================================================

export const reservationFormSchema = z.object({
  defaultTimeSlot: z.number().int().min(15).max(240),
  minReservationDuration: z.number().int().min(15).max(480),
  maxReservationDuration: z.number().int().min(60).max(1440),
  cancellationTermsId: z.string(),
  cancellationDeadlineHours: z.number().int().min(1).max(720),
  modificationDeadlineHours: z.number().int().min(1).max(720),
});

export type ReservationFormInput = z.infer<typeof reservationFormSchema>;
