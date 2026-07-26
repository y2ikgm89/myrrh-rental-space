import "server-only";

import { prisma } from "@/shared/db/prisma";

export type InquiryStatusNotificationRow = {
  readonly id: string;
  readonly receiptNumber: string;
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly updatedAt: Date;
  readonly customerUserId: string | undefined;
};

/**
 * お問い合わせステータス変更通知メール
 * (`sendInquiryStatusNotificationToAll`) 用 payload。
 */
export async function getInquiriesForStatusNotification(
  inquiryIds: string[],
): Promise<InquiryStatusNotificationRow[]> {
  if (inquiryIds.length === 0) return [];

  const inquiries = await prisma.inquiry.findMany({
    where: { id: { in: inquiryIds } },
    select: {
      id: true,
      receiptNumber: true,
      name: true,
      email: true,
      subject: true,
      updatedAt: true,
      customer: { select: { userId: true } },
    },
  });

  return inquiries.map((inquiry) => ({
    id: inquiry.id,
    receiptNumber: inquiry.receiptNumber,
    name: inquiry.name,
    email: inquiry.email,
    subject: inquiry.subject,
    updatedAt: inquiry.updatedAt,
    customerUserId: inquiry.customer?.userId ?? undefined,
  }));
}
