/**
 * 設定セクション用フォームスキーマ — メール・通知
 */
import { z } from "zod";

// =============================================================================
// Site > Email > メール設定
// =============================================================================

export const emailFormSchema = z.object({
  senderEmail: z.union([
    z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" })
      .max(100),
    z.literal(""),
  ]),
  senderName: z.string().max(100, { error: "100文字以内で入力してください" }),
  replyToEmail: z.union([
    z
      .string()
      .email({ error: "有効なメールアドレスを入力してください" })
      .max(100),
    z.literal(""),
  ]),
  sendReservationConfirmationEmail: z.boolean(),
  sendAdminNotificationEmail: z.boolean(),
  notificationEmailAddresses: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type EmailFormInput = z.infer<typeof emailFormSchema>;

// =============================================================================
// Site > Email > 通知設定
// =============================================================================

export const notificationFormSchema = z.object({
  notifyNewReservation: z.boolean(),
  notifyReservationChange: z.boolean(),
  notifyReservationCancel: z.boolean(),
  notifyNewInquiry: z.boolean(),
});

export type NotificationFormInput = z.infer<typeof notificationFormSchema>;
