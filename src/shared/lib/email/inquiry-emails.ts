import "server-only";
import { InquiryReplyEmail } from "@/shared/emails/inquiry-reply";
import { InquiryStatusNotificationEmail } from "@/shared/emails/inquiry-status-notification";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { prisma } from "@/shared/db/prisma";
import { SITE_DEFAULTS } from "../constants";
import { hashForKey, sendEmail } from "./send";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "../errors/server";
import type { EmailResult, InquiryReplyEmailData } from "./types";

async function getSiteName(): Promise<string> {
  const seo = await getSeoSettings();
  return seo?.siteName || SITE_DEFAULTS.name;
}

export async function sendInquiryReplyEmail(
  data: InquiryReplyEmailData,
): Promise<EmailResult> {
  const siteName = await getSiteName();

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
        siteName,
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
    select: { id: true, name: true, email: true, subject: true },
  });

  if (inquiries.length === 0) return;

  const siteName = await getSiteName();
  const statusLabel = newStatus === "RESOLVED" ? "対応完了" : "終了";

  const results = await Promise.allSettled(
    inquiries.map((inquiry) =>
      sendEmail({
        payload: {
          to: inquiry.email,
          subject: `【お問い合わせ${statusLabel}】${inquiry.subject}`,
          react: InquiryStatusNotificationEmail({
            customerName: inquiry.name,
            inquirySubject: inquiry.subject,
            newStatus,
            siteName,
          }),
        },
        idempotencyKey: `inquiry-status/${inquiry.id}/${newStatus}`,
        operation: "sendInquiryStatusNotificationToAll",
        context: { inquiryId: inquiry.id, email: inquiry.email },
      }),
    ),
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
