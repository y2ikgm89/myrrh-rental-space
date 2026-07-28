/**
 * お問い合わせ関連メール
 *
 * お問い合わせ確認、管理者通知メールの送信。
 *
 * @module shared/lib/email/contact-emails
 */

import "server-only";
import { AdminNotificationEmail } from "@/shared/emails/admin-notification";
import { ContactConfirmationEmail } from "@/shared/emails/contact-confirmation";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { getAdminUrl } from "../admin-urls";
import { getAppUrl } from "../constants";
import { sendEmail } from "./send";
import type {
  ContactAdminNotificationDelivery,
  ContactConfirmationRenderContext,
  ContactEmailData,
  EmailResult,
  EmailSendContext,
} from "./types";

/**
 * お問い合わせ ID から、会員向けマイページの問い合わせ詳細 URL を組み立てる。
 * userId が無い（ゲスト送信・未ログイン）場合は undefined を返す。
 */
export function buildMemberInquiryUrl(
  userId: string | null | undefined,
  inquiryId: string,
): string | undefined {
  if (!userId) return undefined;
  return `${getAppUrl()}/mypage/inquiries/${inquiryId}`;
}

/**
 * お問い合わせ確認メールを送信
 */
export async function sendContactConfirmationEmail(
  data: ContactEmailData,
  renderContext: ContactConfirmationRenderContext,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();
  const memberInquiryUrl = buildMemberInquiryUrl(
    data.customerId,
    data.inquiryId,
  );
  const { privacyPolicyUrl } = renderContext;

  return sendEmail(
    {
      payload: {
        to: data.email,
        subject: `【お問い合わせ受付】${data.subject} [${data.receiptNumber}]`,
        react: ContactConfirmationEmail({
          name: data.name,
          receiptNumber: data.receiptNumber,
          subject: data.subject,
          message: data.message,
          ...(memberInquiryUrl !== undefined ? { memberInquiryUrl } : {}),
          ...(privacyPolicyUrl !== undefined ? { privacyPolicyUrl } : {}),
          footer,
        }),
      },
      idempotencyKey: `contact-confirm/${data.inquiryId}`,
      operation: "sendContactConfirmationEmail",
      context: {
        inquiryId: data.inquiryId,
        email: data.email,
      },
    },
    sendContext,
  );
}

/**
 * お問い合わせ管理者通知メールを送信
 */
export async function sendContactAdminNotification(
  data: ContactEmailData,
  delivery: ContactAdminNotificationDelivery,
  sendContext: EmailSendContext,
): Promise<EmailResult> {
  if (delivery.notificationEmails.length === 0) {
    return { ok: false, reason: "disabled" };
  }

  const footer = await getEmailFooterData();

  return sendEmail(
    {
      payload: {
        to: [...delivery.notificationEmails],
        subject: `【新規お問い合わせ】${data.subject} - ${data.name}様 [${data.receiptNumber}]`,
        react: AdminNotificationEmail({
          type: "inquiry",
          name: data.name,
          email: data.email,
          ...(data.phoneNumber != null
            ? { phoneNumber: data.phoneNumber }
            : {}),
          subject: data.subject,
          message: data.message,
          receiptNumber: data.receiptNumber,
          adminUrl: getAdminUrl(`/inquiries/${data.inquiryId}`),
          footer,
        }),
      },
      idempotencyKey: `contact-admin/${data.inquiryId}`,
      operation: "sendContactAdminNotification",
      context: {
        inquiryId: data.inquiryId,
      },
    },
    sendContext,
  );
}
