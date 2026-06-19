/**
 * 設定セクション用フォームスキーマ — メール・通知
 */
import { z } from "zod";
import { optionalText, switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Site > Email > メール設定
// =============================================================================

export const emailFormSchema = z.object({
  // 送信元(From)は env (EMAIL_FROM / EMAIL_FROM_NAME) 優先・DB フォールバック。
  // 空欄は env またはデフォルトにフォールバックする。ドメインの検証済み判定は
  // Server Action 側（validateSenderDomain）で行う。
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
  // 通知先スタッフ（User.id 配列）。チェックボックス群を conform が配列に集約する。
  notificationStaffIds: z.array(z.string()).optional(),
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
