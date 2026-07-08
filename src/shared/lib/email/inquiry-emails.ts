import "server-only";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { InquiryStatusNotificationEmail } from "@/shared/emails/inquiry-status-notification";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { prisma } from "@/shared/db/prisma";
import { buildMemberInquiryUrl } from "./contact-emails";
import { hashForKey, sendEmail } from "./send";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "../errors/server";
import type { EmailResult, InquiryReplyEmailData } from "./types";

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
      subject: `【お問い合わせ回答】${data.originalSubject}`,
      react: InquiryReplyEmail({
        customerName: data.customerName,
        originalSubject: data.originalSubject,
        originalMessage: data.originalMessage,
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
 * お問い合わせステータス変更時に顧客へ通知メールを一括送信する。
 *
 * - RESOLVED / CLOSED のステータス変更のみ対象（NEW / IN_PROGRESS は送信しない）
 * - Promise.allSettled で並列送信し、失敗は logError で個別記録（bulk 全体は成功扱い）
 */
export async function sendInquiryStatusNotificationToAll(
  inquiryIds: string[],
  newStatus: "RESOLVED" | "CLOSED",
): Promise<void> {
  if (inquiryIds.length === 0) return;

  const inquiries = await prisma.inquiry.findMany({
    where: { id: { in: inquiryIds } },
    select: {
      id: true,
      name: true,
      email: true,
      subject: true,
      updatedAt: true,
      customer: { select: { userId: true } },
    },
  });

  if (inquiries.length === 0) return;

  const footer = await getEmailFooterData();
  const statusLabel = newStatus === "RESOLVED" ? "対応完了" : "終了";

  const results = await Promise.allSettled(
    inquiries.map((inquiry) => {
      const memberInquiryUrl = buildMemberInquiryUrl(
        inquiry.customer?.userId,
        inquiry.id,
      );
      return sendEmail({
        payload: {
          to: inquiry.email,
          subject: `【お問い合わせ${statusLabel}】${inquiry.subject}`,
          react: InquiryStatusNotificationEmail({
            customerName: inquiry.name,
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
