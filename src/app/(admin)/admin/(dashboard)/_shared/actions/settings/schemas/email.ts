/**
 * メール・通知設定のZodスキーマ
 */

import { z } from "zod";

// =============================================================================
// Email Schemas
// =============================================================================

export const emailSettingsSchema = z.object({
  senderEmail: z.email().max(100).nullable().or(z.literal("")),
  senderName: z.string().max(100).nullable(),
  replyToEmail: z.email().max(100).nullable().or(z.literal("")),
  sendReservationConfirmationEmail: z.boolean(),
  sendAdminNotificationEmail: z.boolean(),
  notificationEmailAddresses: z.string().max(500).nullable(),
});

export type EmailSettingsInput = z.infer<typeof emailSettingsSchema>;

export const notificationSettingsSchema = z.object({
  notifyNewReservation: z.boolean(),
  notifyReservationChange: z.boolean(),
  notifyReservationCancel: z.boolean(),
  notifyNewInquiry: z.boolean(),
});

export type NotificationSettingsInput = z.infer<
  typeof notificationSettingsSchema
>;
