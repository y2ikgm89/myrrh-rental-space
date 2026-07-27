import "server-only";
import { InquiryCustomerReplyAdminEmail } from "@/shared/emails/inquiry-customer-reply-admin";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { InquiryStatusNotificationEmail } from "@/shared/emails/inquiry-status-notification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { getAdminUrl } from "../admin-urls";
import { buildMemberInquiryUrl } from "./contact-emails";
import { hashForKey, sendEmail } from "./send";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "../errors/server";
import type {
  EmailResult,
  InquiryAdminNotificationDelivery,
  InquiryCustomerReplyAdminEmailData,
  InquiryReplyEmailData,
  InquiryStatusNotificationData,
} from "./types";

export type { InquiryStatusNotificationData } from "./types";

export async function sendInquiryReplyEmail(
  data: InquiryReplyEmailData,
): Promise<EmailResult> {
  const footer = await getEmailFooterData();
  const memberInquiryUrl = buildMemberInquiryUrl(
    data.customerUserId,
    data.inquiryId,
  );

  return sendEmail({
    payload: {
      to: data.customerEmail,
      subject: `【お問い合わせ回答】${data.subject} [${data.receiptNumber}]`,
      react: InquiryReplyEmail({
        customerName: data.customerName,
        receiptNumber: data.receiptNumber,
        subject: data.subject,
        message: data.message,
        replyMessage: data.replyMessage,
        repliedByName: data.repliedByName,
        ...(memberInquiryUrl !== undefined ? { memberInquiryUrl } : {}),
        footer,
      }),
    },
    idempotencyKey: `inquiry-reply/${data.inquiryId}/${hashForKey(data.replyMessage)}`,
    operation: "sendInquiryReplyEmail",
    context: {
      inquiryId: data.inquiryId,
      email: data.customerEmail,
    },
  });
}

/**
 * 会員によるお問い合わせ続報（顧客返信）の管理者通知メールを送信
 */
export async function sendInquiryCustomerReplyAdminEmail(
  data: InquiryCustomerReplyAdminEmailData,
  delivery: InquiryAdminNotificationDelivery,
): Promise<EmailResult> {
  if (delivery.notificationEmails.length === 0) {
    return { ok: false, reason: "disabled" };
  }

  const footer = await getEmailFooterData();

  return sendEmail({
    payload: {
      to: [...delivery.notificationEmails],
      subject: `【お問い合わせ続報】${data.subject} [${data.receiptNumber}]`,
      react: InquiryCustomerReplyAdminEmail({
        customerName: data.customerName,
        receiptNumber: data.receiptNumber,
        subject: data.subject,
        replyMessage: data.replyMessage,
        adminUrl: getAdminUrl(`/inquiries/${data.inquiryId}`),
        footer,
      }),
    },
    idempotencyKey: `inquiry-customer-reply-admin/${data.inquiryId}/${hashForKey(data.replyMessage)}`,
    operation: "sendInquiryCustomerReplyAdminEmail",
    context: {
      inquiryId: data.inquiryId,
    },
  });
}

/**
 * お問い合わせステータス変更時に顧客へ通知メールを一括送信する。
 *
 * - RESOLVED / CLOSED のステータス変更のみ対象（NEW / IN_PROGRESS は送信しない）
 * - Promise.allSettled で並列送信し、失敗は logError で個別記録（bulk 全体は成功扱い）
 */
export async function sendInquiryStatusNotificationToAll(
  inquiries: InquiryStatusNotificationData[],
  newStatus: "RESOLVED" | "CLOSED",
): Promise<void> {
  if (inquiries.length === 0) return;

  const footer = await getEmailFooterData();
  const statusLabel = newStatus === "RESOLVED" ? "対応完了" : "終了";

  const results = await Promise.allSettled(
    inquiries.map((inquiry) => {
      const memberInquiryUrl = buildMemberInquiryUrl(
        inquiry.customerUserId,
        inquiry.id,
      );
      return sendEmail({
        payload: {
          to: inquiry.email,
          subject: `【お問い合わせ${statusLabel}】${inquiry.subject} [${inquiry.receiptNumber}]`,
          react: InquiryStatusNotificationEmail({
            customerName: inquiry.name,
            receiptNumber: inquiry.receiptNumber,
            inquirySubject: inquiry.subject,
            newStatus,
            ...(memberInquiryUrl !== undefined ? { memberInquiryUrl } : {}),
            footer,
          }),
        },
        // 同一 inquiry を 24h 内に RESOLVED → 再オープン → 再 RESOLVED するケースで
        // payload (name/subject) が変わっても Resend が `invalid_idempotent_request` で
        // silent drop することを防ぐため updatedAt を末尾に混ぜる。
        idempotencyKey: `inquiry-status/${inquiry.id}/${newStatus}/${inquiry.updatedAt.getTime()}`,
        operation: "sendInquiryStatusNotificationToAll",
        context: { inquiryId: inquiry.id, email: inquiry.email },
      });
    }),
  );

  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const inquiry = inquiries[i];
      if (inquiry) {
        logError(normalizeError(result.reason), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "sendInquiryStatusNotificationToAll",
            inquiryId: inquiry.id,
            email: inquiry.email,
          },
        });
      }
    }
  }
}
