/**
 * 設定セクション用フォームスキーマ — メール・通知
 */
import { z } from "zod";
import { optionalText, switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Site > Email > メール設定
// =============================================================================

export const emailFormSchema = z.object({
  // conform は空欄を undefined 化するため `.optional()` 必須（"" リテラルだけでは弾かれる）。
  senderEmail: z
    .union([
      z.email({ error: "有効なメールアドレスを入力してください" }).max(100),
      z.literal(""),
    ])
    .optional(),
  senderName: optionalText(100),
  replyToEmail: z
    .union([
      z.email({ error: "有効なメールアドレスを入力してください" }).max(100),
      z.literal(""),
    ])
    .optional(),
  sendReservationConfirmationEmail: switchBoolean(),
  sendAdminNotificationEmail: switchBoolean(),
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
});

export type NotificationFormInput = z.infer<typeof notificationFormSchema>;
