import type {
  CustomerType,
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

/** Inquiry.status 変更履歴の 1 行 (createdAt 昇順で detail サイドバーに表示)。 */
export type InquiryStatusHistoryItem = {
  id: string;
  fromStatus: InquiryStatus | null;
  toStatus: InquiryStatus;
  changedById: string | null;
  /** changedById が null (システム/顧客起因) の場合は null。User 削除後も null。 */
  changedByName: string | null;
  reason: string | null;
  createdAt: Date;
};

/** スタッフ間 internal メモ (顧客には見えない)。 */
export type InquiryInternalNoteItem = {
  id: string;
  body: string;
  authorId: string;
  authorName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** タグマスタの 1 件（Inquiry への付与状態と一覧表示の両方で使う最小形）。 */
export type InquiryTagItem = {
  id: string;
  name: string;
  color: string | null;
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
  /** createdAt 昇順の status 変更履歴 (creation 行を含む)。 */
  statusHistory: InquiryStatusHistoryItem[];
  /** createdAt 昇順の internal メモ。顧客向け経路では絶対に露出させない。 */
  internalNotes: InquiryInternalNoteItem[];
  /** name 昇順で付与済みタグ。 */
  tags: InquiryTagItem[];
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
  /** Phase 4: 担当者名 (未アサインは null) */
  assigneeName?: string | null;
  /** Phase 4: 付与タグ名 (name 昇順) */
  tagNames?: string[];
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
  assigneeId?: string | undefined;
  /** 付与タグでの絞り込み (InquiryTag.id) */
  tagId?: string | undefined;
  /** 送信者種別 (Inquiry.customerType、フォーム未入力時は null) */
  customerType?: CustomerType | undefined;
  /** true = slaExpiresAt が過去日時 (未設定は対象外) */
  slaExpired?: boolean | undefined;
  /** 受付日時 (createdAt) の範囲フィルタ開始 (inclusive) */
  createdFrom?: Date | undefined;
  /** 受付日時 (createdAt) の範囲フィルタ終了 (inclusive) */
  createdTo?: Date | undefined;
  /** 既定 false = soft-deleted を除外。true で削除済みも含む */
  includeDeleted?: boolean | undefined;
};

export type InquiryPagination = PaginationInput<"createdAt" | "updatedAt">;

/** タグマスタ一覧行 (紐づく Inquiry 件数付き。削除ガードの目安表示に使う)。 */
export type InquiryTagOption = InquiryTagItem & {
  inquiryCount: number;
};

/** 担当者アサイン用の候補スタッフ (inquiry:update 権限を持つロールのみ)。 */
export type AssignableStaffOption = {
  id: string;
  name: string;
  email: string;
};

export type InquiryStats = {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
  closed: number;
  flagged: number;
  spam: number;
};
