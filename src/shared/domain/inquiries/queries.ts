import "server-only";

import { InquiryReplyAuthorType, InquiryStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import type { Prisma } from "@generated/prisma/client";

type InquiryWhereInput = Prisma.InquiryWhereInput;
import type {
  GetInquiriesResult,
  InquiryAttachmentItem,
  InquiryFilters,
  InquiryListItem,
  InquiryPagination,
  InquiryReplyItem,
  InquiryStats,
  InquiryWithCustomer,
} from "@/shared/domain/inquiries/types";

/**
 * findMany の select で返す reply 生形状（author を string に平坦化する前）。
 * queries.ts / customer-queries.ts で共有する。
 */
export const REPLY_SELECT_INTERNAL = {
  id: true,
  body: true,
  authorType: true,
  createdAt: true,
  author: { select: { name: true } },
  authorCustomer: { select: { lastName: true, firstName: true } },
} as const;

type RawReply = {
  id: string;
  body: string;
  authorType: InquiryReplyItem["authorType"];
  createdAt: Date;
  author: { name: string } | null;
  authorCustomer: { lastName: string; firstName: string } | null;
};

export function flattenReply(r: RawReply): InquiryReplyItem {
  let authorName: string | null;
  switch (r.authorType) {
    case InquiryReplyAuthorType.CUSTOMER:
      authorName = r.authorCustomer
        ? `${r.authorCustomer.lastName} ${r.authorCustomer.firstName}`
        : null;
      break;
    case InquiryReplyAuthorType.STAFF:
      authorName = r.author?.name ?? null;
      break;
    default: {
      const _exhaustive: never = r.authorType;
      throw new Error(`Unknown authorType: ${String(_exhaustive)}`);
    }
  }

  return {
    id: r.id,
    body: r.body,
    authorType: r.authorType,
    authorName,
    createdAt: r.createdAt,
  };
}

/**
 * findMany の select で返す attachment 生形状。queries.ts / customer-queries.ts で共有する。
 */
export const ATTACHMENT_SELECT_INTERNAL = {
  id: true,
  filename: true,
  mimeType: true,
  sizeBytes: true,
  replyId: true,
  createdAt: true,
} as const;

type RawAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  replyId: string | null;
  createdAt: Date;
};

export function flattenAttachment(a: RawAttachment): InquiryAttachmentItem {
  return {
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType,
    sizeBytes: a.sizeBytes,
    replyId: a.replyId,
    createdAt: a.createdAt,
  };
}

export async function getInquiries(
  filters: InquiryFilters = {},
  pagination: InquiryPagination = {},
): Promise<Serialized<GetInquiriesResult>> {
  const { status, search, assigneeId, includeDeleted } = filters;
  const { sortBy = "createdAt", sortOrder = "desc" } = pagination;
  const { skip, take, page, limit } = paginate(pagination);

  const where: InquiryWhereInput = {};

  if (!includeDeleted) {
    where.deletedAt = null;
  }

  if (status && status !== "ALL") {
    where.status = status;
  }

  if (assigneeId) {
    where.assigneeId = assigneeId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { subject: { contains: search, mode: "insensitive" } },
      { message: { contains: search, mode: "insensitive" } },
      { receiptNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  // Round-5 audit Finding #22: 一覧 (InquiryTable) が実際に描画するのは
  // 件名・受付番号・お名前・会社名・メール・顧客・受付日時・ステータスのみ
  // (InquiryActionCell/InquiryBulkActions も id しか使わない)。旧実装は
  // getInquiryById と同じ select を使い回しており、message 全文・全 reply
  // スレッド本文・phoneNumber 等ページ表示に不要なデータを毎ページ・毎行
  // フルロードしていた。詳細表示専用フィールドが必要な画面は getInquiryById
  // を使う。
  const [total, inquiries] = await Promise.all([
    prisma.inquiry.count({ where }),
    prisma.inquiry.findMany({
      where,
      select: {
        id: true,
        receiptNumber: true,
        name: true,
        companyName: true,
        email: true,
        subject: true,
        status: true,
        customer: {
          select: {
            id: true,
            lastName: true,
            firstName: true,
          },
        },
        createdAt: true,
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip,
      take,
    }),
  ]);

  const shaped: InquiryListItem[] = inquiries.map((i) => ({
    id: i.id,
    receiptNumber: i.receiptNumber,
    name: i.name,
    companyName: i.companyName,
    email: i.email,
    subject: i.subject,
    status: i.status,
    customer: i.customer,
    createdAt: i.createdAt,
  }));

  return {
    inquiries: toPlainArray(shaped),
    total,
    page,
    limit,
    totalPages: calcTotalPages(total, limit),
  };
}

export async function getInquiryById(
  id: string,
): Promise<Serialized<InquiryWithCustomer> | null> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    select: {
      id: true,
      receiptNumber: true,
      name: true,
      companyName: true,
      email: true,
      phoneNumber: true,
      subject: true,
      message: true,
      status: true,
      customerId: true,
      assigneeId: true,
      assignee: { select: { name: true } },
      slaExpiresAt: true,
      deletedAt: true,
      anonymizedAt: true,
      replies: {
        orderBy: { createdAt: "asc" },
        select: REPLY_SELECT_INTERNAL,
      },
      attachments: {
        orderBy: { createdAt: "asc" },
        select: ATTACHMENT_SELECT_INTERNAL,
      },
      customer: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          email: true,
          userId: true,
        },
      },
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!inquiry) return null;

  const shaped: InquiryWithCustomer = {
    id: inquiry.id,
    receiptNumber: inquiry.receiptNumber,
    name: inquiry.name,
    companyName: inquiry.companyName,
    email: inquiry.email,
    phoneNumber: inquiry.phoneNumber,
    subject: inquiry.subject,
    message: inquiry.message,
    status: inquiry.status,
    customerId: inquiry.customerId,
    assigneeId: inquiry.assigneeId,
    assigneeName: inquiry.assignee?.name ?? null,
    slaExpiresAt: inquiry.slaExpiresAt,
    deletedAt: inquiry.deletedAt,
    anonymizedAt: inquiry.anonymizedAt,
    replies: inquiry.replies.map(flattenReply),
    attachments: inquiry.attachments.map(flattenAttachment),
    customer: inquiry.customer,
    createdAt: inquiry.createdAt,
    updatedAt: inquiry.updatedAt,
  };

  return toPlainObject(shaped);
}

/**
 * 添付ダウンロード route 用の最小投影。
 *
 * `customerId` は customer 側 route の所有権チェック（`inquiry.customerId` 一致）
 * に使う。admin 側 route は `checkPermission("inquiry","read")` のみで
 * customerId は見ない（admin は全件アクセス可）。
 *
 * soft-deleted（`deletedAt` 非 null）はここでは弾かない — admin は retention
 * 猶予期間中の soft-deleted inquiry も詳細画面から閲覧できる（`getInquiryById`
 * が `deletedAt` で filter しない設計と対称）。customer 側は
 * `getCustomerInquiryById` 自体が `deletedAt: null` で絞るため、customer は
 * そもそも soft-deleted inquiry の詳細ページに到達できず矛盾しない。
 *
 * anonymize 済み（`anonymizedAt` 非 null）は 404 相当（null）にする —
 * `anonymizeInquiryCommand`（PR6）が添付を R2 ごと削除する設計のため、万一
 * DB 行が残っていてもここでは配信しない防御。
 */
export type InquiryAttachmentForDownload = {
  id: string;
  r2Key: string;
  mimeType: string;
  filename: string;
  inquiryId: string;
  customerId: string | null;
};

export async function getInquiryAttachmentForDownload(
  id: string,
): Promise<InquiryAttachmentForDownload | null> {
  const attachment = await prisma.inquiryAttachment.findUnique({
    where: { id },
    select: {
      id: true,
      r2Key: true,
      mimeType: true,
      filename: true,
      inquiryId: true,
      inquiry: {
        select: { customerId: true, anonymizedAt: true },
      },
    },
  });

  if (!attachment || attachment.inquiry.anonymizedAt !== null) {
    return null;
  }

  return {
    id: attachment.id,
    r2Key: attachment.r2Key,
    mimeType: attachment.mimeType,
    filename: attachment.filename,
    inquiryId: attachment.inquiryId,
    customerId: attachment.inquiry.customerId,
  };
}

export async function getInquiryStats(): Promise<InquiryStats> {
  const notDeleted: InquiryWhereInput = { deletedAt: null };
  const [total, newCount, inProgress, resolved, closed, flagged, spam] =
    await Promise.all([
      prisma.inquiry.count({ where: notDeleted }),
      prisma.inquiry.count({
        where: { ...notDeleted, status: InquiryStatus.NEW },
      }),
      prisma.inquiry.count({
        where: { ...notDeleted, status: InquiryStatus.IN_PROGRESS },
      }),
      prisma.inquiry.count({
        where: { ...notDeleted, status: InquiryStatus.RESOLVED },
      }),
      prisma.inquiry.count({
        where: { ...notDeleted, status: InquiryStatus.CLOSED },
      }),
      prisma.inquiry.count({
        where: { ...notDeleted, status: InquiryStatus.FLAGGED },
      }),
      prisma.inquiry.count({
        where: { ...notDeleted, status: InquiryStatus.SPAM },
      }),
    ]);

  return {
    total,
    new: newCount,
    inProgress,
    resolved,
    closed,
    flagged,
    spam,
  };
}
