/**
 * お問い合わせ関連メール
 *
 * お問い合わせ確認、管理者通知メールの送信。
 *
 * @module shared/lib/email/contact-emails
 */

import "server-only";
import { ContactConfirmationEmail } from "@/shared/emails/contact-confirmation";
import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import { getNotificationEmailAddresses as getNotificationEmailAddressesQuery } from "@/shared/domain/settings/queries/notification";
import { getAdminUrl } from "../constants";
import { sendEmail } from "./send";
import type { ContactEmailData, EmailResult } from "./types";

// =============================================================================
// Helper Functions
// =============================================================================

async function getNotificationEmails(): Promise<string[]> {
  return getNotificationEmailAddressesQuery();
}

// =============================================================================
// Contact Emails
// =============================================================================

/**
 * お問い合わせ確認メールを送信
 */
export async function sendContactConfirmationEmail(
  data: ContactEmailData,
): Promise<EmailResult> {
  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: data.email,
        subject: `【お問い合わせ受付】${data.subject}`,
        react: ContactConfirmationEmail({
          name: data.name,
          subject: data.subject,
          message: data.message,
        }),
      }),
    {
      operation: "sendContactConfirmationEmail",
      inquiryId: data.inquiryId,
      email: data.email,
    },
  );
}

/**
 * お問い合わせ管理者通知メールを送信
 */
export async function sendContactAdminNotification(
  data: ContactEmailData,
): Promise<EmailResult> {
  const notificationEmails = await getNotificationEmails();
  if (notificationEmails.length === 0) return { success: true };

  return sendEmail(
    (resend, from) =>
      resend.emails.send({
        from,
        to: notificationEmails,
        subject: `【新規お問い合わせ】${data.subject} - ${data.name}様`,
        react: AdminNotificationEmail({
          type: "inquiry",
          name: data.name,
          email: data.email,
          subject: data.subject,
          message: data.message,
          inquiryId: data.inquiryId.slice(0, 8).toUpperCase(),
          adminUrl: getAdminUrl(`/inquiries/${data.inquiryId}`),
        }),
      }),
    {
      operation: "sendContactAdminNotification",
      inquiryId: data.inquiryId,
    },
  );
}
