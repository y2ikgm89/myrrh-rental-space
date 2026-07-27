import "server-only";

import {
  InquiryReplyAuthorType,
  InquiryStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { ADMIN_OR_HIGHER_ROLES } from "@/shared/lib/admin-roles";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import type { Prisma } from "@generated/prisma/client";

type InquiryWhereInput = Prisma.InquiryWhereInput;
import type {
  AssignableStaffOption,
  GetInquiriesResult,
  InquiryAttachmentItem,
  InquiryFilters,
  InquiryInternalNoteItem,
  InquiryListItem,
  InquiryPagination,
  InquiryReplyItem,
  InquiryStats,
  InquiryStatusHistoryItem,
  InquiryTagOption,
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

/** InquiryStatusHistory の select 生形状 (changedBy を名前に平坦化する前)。 */
const STATUS_HISTORY_SELECT = {
  id: true,
  fromStatus: true,
  toStatus: true,
  changedById: true,
  changedBy: { select: { name: true } },
  reason: true,
  createdAt: true,
} as const;

type RawStatusHistory = {
  id: string;
  fromStatus: InquiryStatus | null;
  toStatus: InquiryStatus;
  changedById: string | null;
  changedBy: { name: string } | null;
  reason: string | null;
  createdAt: Date;
};

function flattenStatusHistory(h: RawStatusHistory): InquiryStatusHistoryItem {
  return {
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    changedById: h.changedById,
    changedByName: h.changedBy?.name ?? null,
    reason: h.reason,
    createdAt: h.createdAt,
  };
}

/** InquiryInternalNote の select 生形状 (author を名前に平坦化する前)。 */
const INTERNAL_NOTE_SELECT = {
  id: true,
  body: true,
  authorId: true,
  author: { select: { name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

type RawInternalNote = {
  id: string;
  body: string;
  authorId: string;
  author: { name: string } | null;
  createdAt: Date;
  updatedAt: Date;
};

function flattenInternalNote(n: RawInternalNote): InquiryInternalNoteItem {
  return {
    id: n.id,
    body: n.body,
    authorId: n.authorId,
    authorName: n.author?.name ?? null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

export async function getInquiries(
  filters: InquiryFilters = {},
  pagination: InquiryPagination = {},
): Promise<Serialized<GetInquiriesResult>> {
  const {
    status,
    search,
    assigneeId,
    tagId,
    customerType,
    slaExpired,
    createdFrom,
    createdTo,
    includeDeleted,
  } = filters;
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

  if (tagId) {
    where.tags = { some: { tagId } };
  }

  if (customerType) {
    where.customerType = customerType;
  }

  // slaExpiresAt が設定済みかつ現在時刻より過去 = SLA 超過。未設定 (null) は対象外。
  if (slaExpired) {
    where.slaExpiresAt = { not: null, lt: new Date() };
  }

  if (createdFrom || createdTo) {
    where.createdAt = {
      ...(createdFrom ? { gte: createdFrom } : {}),
      ...(createdTo ? { lte: createdTo } : {}),
    };
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
  // を使う。Phase 4: 担当者名・タグ名を軽量投影として追加。
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
        assignee: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
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
    assigneeName: i.assignee?.name ?? null,
    tagNames: i.tags.map((t) => t.tag.name),
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
      statusHistory: {
        orderBy: { createdAt: "asc" },
        select: STATUS_HISTORY_SELECT,
      },
      internalNotes: {
        orderBy: { createdAt: "asc" },
        select: INTERNAL_NOTE_SELECT,
      },
      tags: {
        orderBy: { tag: { name: "asc" } },
        select: { tag: { select: { id: true, name: true, color: true } } },
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
    statusHistory: inquiry.statusHistory.map(flattenStatusHistory),
    internalNotes: inquiry.internalNotes.map(flattenInternalNote),
    tags: inquiry.tags.map((t) => t.tag),
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
 * soft-deleted（`deletedAt` 非 null）は 404 相当（null）にする — customer
 * mypage は direct URL でも soft-deleted inquiry の添付を取得できない。
 * このヘルパーは customer / admin 共通の deny-deleted ゲート（clean break）。
 * admin が retention 猶予中の soft-deleted 添付を配信する必要がある場合は
 * 別クエリを用意する。
 *
 * anonymize 済み（`anonymizedAt` 非 null）も 404 相当（null）にする —
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
        select: { customerId: true, anonymizedAt: true, deletedAt: true },
      },
    },
  });

  if (
    !attachment ||
    attachment.inquiry.anonymizedAt !== null ||
    attachment.inquiry.deletedAt !== null
  ) {
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

// ============================================================================
// Phase 4 (ops surfaces): タグマスタ一覧 / アサイン可能スタッフ一覧
// ============================================================================

/** タグマスタ一覧 (name 昇順)。紐づく Inquiry 件数を添えて削除可否の目安を示す。 */
export async function listInquiryTagsQuery(): Promise<InquiryTagOption[]> {
  const tags = await prisma.inquiryTag.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { inquiries: true } },
    },
  });

  return tags.map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    inquiryCount: t._count.inquiries,
  }));
}

/**
 * 担当者アサイン候補のスタッフ一覧 (name 昇順)。
 *
 * `inquiry:update` 権限を持つロール (ADMIN / SUPER_ADMIN) のみを対象にする。
 * EDITOR / VIEWER は閲覧専用のため、アサインしても実際に対応できない。
 */
export async function listAssignableStaffQuery(): Promise<
  AssignableStaffOption[]
> {
  const users = await prisma.user.findMany({
    where: {
      role: { in: [...ADMIN_OR_HIGHER_ROLES] },
      dashboardEnabled: true,
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users;
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
