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
import { getNotificationEmailAddresses } from "@/shared/domain/settings/queries/notification";
import { EMAIL_TEMPLATE_TYPE } from "@/shared/lib/validations/enums/helpers";
import { getAdminUrl } from "../constants";
import { omitUndefined } from "../serialize";
import { sendEmail } from "./send";
import { resolveTemplate } from "./resolve-template";
import type { ContactEmailData, EmailResult } from "./types";

// =============================================================================
// Contact Emails
// =============================================================================

/**
 * お問い合わせ確認メールを送信
 */
export async function sendContactConfirmationEmail(
  data: ContactEmailData,
): Promise<EmailResult> {
  const variables = omitUndefined({
    customerName: data.name,
    inquirySubject: data.subject,
    inquiryMessage: data.message,
    inquiryId: data.inquiryId.slice(0, 8).toUpperCase(),
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.CONTACT_CONFIRMATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: data.email,
          subject: resolved.subject,
          react: ContactConfirmationEmail(
            omitUndefined({
              subject: data.subject,
              message: data.message,
              greeting: resolved.greeting,
              intro: resolved.intro,
              outro: resolved.outro,
              preview: resolved.preview,
              companyName: resolved.companyName,
              footerNote: resolved.footerNote,
              supportContactText: resolved.supportContactText,
            }),
          ),
        }),
      ),
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
  const notificationEmails = await getNotificationEmailAddresses();
  if (notificationEmails.length === 0) return { success: true };

  const variables = omitUndefined({
    customerName: data.name,
    customerEmail: data.email,
    inquirySubject: data.subject,
    inquiryMessage: data.message,
    inquiryId: data.inquiryId.slice(0, 8).toUpperCase(),
  });

  const resolved = await resolveTemplate(
    EMAIL_TEMPLATE_TYPE.ADMIN_NOTIFICATION,
    variables,
  );

  if (!resolved || !resolved.enabled) {
    return { success: true };
  }

  return sendEmail(
    (resend, from) =>
      resend.emails.send(
        omitUndefined({
          from,
          to: notificationEmails,
          subject: resolved.subject,
          react: AdminNotificationEmail(
            omitUndefined({
              type: "inquiry" as const,
              name: data.name,
              email: data.email,
              subject: data.subject,
              message: data.message,
              inquiryId: data.inquiryId.slice(0, 8).toUpperCase(),
              adminUrl: getAdminUrl(`/inquiries/${data.inquiryId}`),
              greeting: resolved.greeting,
              intro: resolved.intro,
              outro: resolved.outro,
              preview: resolved.preview,
              companyName: resolved.companyName,
              footerNote: resolved.footerNote,
              supportContactText: resolved.supportContactText,
            }),
          ),
        }),
      ),
    {
      operation: "sendContactAdminNotification",
      inquiryId: data.inquiryId,
    },
  );
}
