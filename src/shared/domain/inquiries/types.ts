import type {
  InquiryReplyAuthorType,
  InquiryStatus,
} from "@generated/prisma/enums";
import type { PaginationInput } from "@/shared/lib/pagination";

export type InquiryReplyItem = {
  id: string;
  body: string;
  authorType: InquiryReplyAuthorType;
  /** STAFF のときのみ非 null。CUSTOMER 返信は顧客側の識別子から解決する。 */
  authorName: string | null;
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

export type GetInquiriesResult = {
  inquiries: InquiryWithCustomer[];
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
