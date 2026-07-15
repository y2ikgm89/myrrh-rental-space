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
  // イベント前日リマインダー。参加者全員へ一斉送信されメール量が増えやすいため
  // schema 側の @default(false) と揃えて既定 OFF（opt-in）。
  notifyEventReminder: switchBoolean(),
  // 通知先スタッフ（User.id 配列）。チェックボックス群を conform が配列に集約する。
  notificationStaffIds: z
    .array(z.string())
    .optional()
    .transform((value) => value ?? []),
  // カスタム通知先。同名 hidden input の複数値を配列として受け取る。
  notificationEmailAddresses: z
    .array(
      z
        .email({ error: "有効なメールアドレスを入力してください" })
        .max(100, { error: "メールアドレスは100文字以内で入力してください" }),
    )
    .max(50, { error: "カスタム通知先は50件以内で入力してください" })
    .optional()
    .transform((value) => value ?? []),
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
  notifyEventWaitlistRegistration: switchBoolean(),
  notifyEventCancellation: switchBoolean(),
});

export type NotificationFormInput = z.infer<typeof notificationFormSchema>;
