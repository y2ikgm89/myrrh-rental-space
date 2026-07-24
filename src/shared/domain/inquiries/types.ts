import type {
  InquiryReplyAuthorType,
  InquiryStatus,
} from "@generated/prisma/enums";
import type { PaginationInput } from "@/shared/lib/pagination";

export type InquiryReplyItem = {
  id: string;
  body: string;
  authorType: InquiryReplyAuthorType;
  /** STAFF → User.name。CUSTOMER → lastName + firstName。削除・匿名化後は null。 */
  authorName: string | null;
  createdAt: Date;
};

/**
 * お問い合わせ添付ファイルの 1 件。private R2 bucket に保存され `r2Key` は
 * DB 内部でのみ保持する（このアプリ層の型には含めない — download route が
 * id から都度 DB 引き当てる設計。公開 URL は存在しない）。
 */
export type InquiryAttachmentItem = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** 特定の返信への添付なら非 null。Inquiry 本体への添付は null。 */
  replyId: string | null;
  createdAt: Date;
};

export type InquiryData = {
  id: string;
  receiptNumber: string;
  name: string;
  companyName: string | null;
  email: string;
  phoneNumber: string | null;
  subject: string;
  message: string;
  status: InquiryStatus;
  customerId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  slaExpiresAt: Date | null;
  deletedAt: Date | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** createdAt 昇順の返信スレッド。ゲスト向けメールで参照するのは最新 (末尾) */
  replies: InquiryReplyItem[];
  /** createdAt 昇順の添付ファイル一覧（Inquiry 本体 + 全 reply 分をまとめて表示）。 */
  attachments: InquiryAttachmentItem[];
};

export type InquiryWithCustomer = InquiryData & {
  customer: {
    id: string;
    lastName: string;
    firstName: string;
    email: string;
    userId: string | null;
  } | null;
};

/**
 * 一覧表示専用の軽量投影。Round-5 audit Finding #22: 一覧が実際に描画するのは
 * この形だけだが、旧実装は詳細画面と同じ select（全 reply 本文・message 全文・
 * phoneNumber 等）を使い回しており、一覧ページ取得のたびに使わないデータを
 * 毎行フルロードしていた。
 */
export type InquiryListItem = {
  id: string;
  receiptNumber: string;
  name: string;
  companyName: string | null;
  email: string;
  subject: string;
  status: InquiryStatus;
  createdAt: Date;
  customer: {
    id: string;
    lastName: string;
    firstName: string;
  } | null;
};

export type GetInquiriesResult = {
  inquiries: InquiryListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type InquiryFilters = {
  status?: InquiryStatus | "ALL" | undefined;
  search?: string | undefined;
  /** Phase 4 で拡張予定: 期間・担当者・customerType・tag フィルタ */
  assigneeId?: string | undefined;
  /** 既定 false = soft-deleted を除外。true で削除済みも含む */
  includeDeleted?: boolean | undefined;
};

export type InquiryPagination = PaginationInput<"createdAt" | "updatedAt">;

export type InquiryStats = {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
  closed: number;
  flagged: number;
  spam: number;
};
