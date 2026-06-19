/**
 * 設定セクション用フォームスキーマ — メール・通知
 */
import { z } from "zod";
import { optionalText, switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Site > Email > メール設定
// =============================================================================

export const emailFormSchema = z.object({
  // 送信元(From)は env (EMAIL_FROM / EMAIL_FROM_NAME) が SSoT のため UI からは設定しない。
  // conform は空欄を undefined 化するため `.optional()` 必須（"" リテラルだけでは弾かれる）。
  replyToEmail: z
    .union([
      z.email({ error: "有効なメールアドレスを入力してください" }).max(100),
      z.literal(""),
    ])
    .optional(),
  sendReservationConfirmationEmail: switchBoolean(),
  notificationEmailAddresses: optionalText(500),
});

export type EmailFormInput = z.infer<typeof emailFormSchema>;

// =============================================================================
// Site > Email > 通知設定
// =============================================================================

export const notificationFormSchema = z.object({
  notifyNewReservation: switchBoolean(),
  notifyReservationChange: switchBoolean(),
  notifyReservationCancel: switchBoolean(),
  notifyNewInquiry: switchBoolean(),
  notifyEventRegistration: switchBoolean(),
  notifyEventCancellation: switchBoolean(),
});

export type NotificationFormInput = z.infer<typeof notificationFormSchema>;
