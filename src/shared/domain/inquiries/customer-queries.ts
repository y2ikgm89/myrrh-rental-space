import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  ATTACHMENT_SELECT_INTERNAL,
  flattenAttachment,
  flattenReply,
  REPLY_SELECT_INTERNAL,
} from "./queries";
import type { InquiryAttachmentItem, InquiryReplyItem } from "./types";
import type { Prisma } from "@generated/prisma/client";
import type { InquiryStatus } from "@/shared/lib/validations/enums/prisma-types";

const CUSTOMER_INQUIRY_LIST_SELECT = {
  id: true,
  receiptNumber: true,
  subject: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  /** 返信が 1 件でもあるか (list の "返信あり" バッジ判定用) */
  _count: { select: { replies: true } },
} as const satisfies Prisma.InquirySelect;

const CUSTOMER_INQUIRY_DETAIL_SELECT = {
  id: true,
  receiptNumber: true,
  name: true,
  companyName: true,
  email: true,
  phoneNumber: true,
  subject: true,
  message: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  replies: {
    orderBy: { createdAt: "asc" },
    select: REPLY_SELECT_INTERNAL,
  },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: ATTACHMENT_SELECT_INTERNAL,
  },
} as const satisfies Prisma.InquirySelect;

/** 一覧行 (返信有無だけ持つ軽量 shape)。 */
export type CustomerInquiryListItem = {
  id: string;
  receiptNumber: string;
  subject: string;
  status: InquiryStatus;
  createdAt: Date;
  updatedAt: Date;
  replyCount: number;
};

export async function getCustomerInquiries(
  customerId: string,
): Promise<CustomerInquiryListItem[]> {
  const rows = await prisma.inquiry.findMany({
    where: { customerId, deletedAt: null },
    select: CUSTOMER_INQUIRY_LIST_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    subject: r.subject,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    replyCount: r._count.replies,
  }));
}

export type CustomerInquiryDetail = {
  id: string;
  receiptNumber: string;
  name: string;
  companyName: string | null;
  email: string;
  phoneNumber: string | null;
  subject: string;
  message: string;
  status: InquiryStatus;
  createdAt: Date;
  updatedAt: Date;
  replies: InquiryReplyItem[];
  attachments: InquiryAttachmentItem[];
};

export async function getCustomerInquiryById(
  inquiryId: string,
  customerId: string,
): Promise<CustomerInquiryDetail | null> {
  const inquiry = await prisma.inquiry.findFirst({
    where: { id: inquiryId, customerId, deletedAt: null },
    select: CUSTOMER_INQUIRY_DETAIL_SELECT,
  });
  if (!inquiry) return null;
  return {
    id: inquiry.id,
    receiptNumber: inquiry.receiptNumber,
    name: inquiry.name,
    companyName: inquiry.companyName,
    email: inquiry.email,
    phoneNumber: inquiry.phoneNumber,
    subject: inquiry.subject,
    message: inquiry.message,
    status: inquiry.status,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
    replies: inquiry.replies.map(flattenReply),
    attachments: inquiry.attachments.map(flattenAttachment),
  };
}
