import type { PaginationInput } from "@/shared/lib/pagination";
import type { Serialized } from "@/shared/lib/serialize";

type FaqItemRecord = {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  order: number;
  isPublished: boolean;
  publishedAt: Date | null;
  deletedAt: Date | null;
  viewCount: number;
  lastViewedAt: Date | null;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type FaqCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  order: number;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: FaqItemRecord[];
};

type FaqCategorySummaryRecord = {
  id: string;
  name: string;
  slug: string;
};

type FaqItemWithCategoryRecord = FaqItemRecord & {
  category: FaqCategorySummaryRecord;
};

/** items を含まないカテゴリ本体（ドロップダウン以外の単体取得・編集用） */
type FaqCategoryDataRecord = Omit<FaqCategoryRecord, "items">;

/** カテゴリ一覧グリッド表示用（全件本文の代わりに件数のみ持つ） */
type FaqCategoryWithCountsRecord = FaqCategoryDataRecord & {
  itemCount: number;
  publishedItemCount: number;
};

export type FaqItemData = Serialized<FaqItemRecord>;
export type FaqCategoryWithItems = Serialized<FaqCategoryRecord>;
export type FaqCategoryData = Serialized<FaqCategoryDataRecord>;
export type FaqCategoryWithItemCounts = Serialized<FaqCategoryWithCountsRecord>;
export type FaqItemWithCategory = Serialized<FaqItemWithCategoryRecord>;

/** カテゴリ選択ドロップダウン用の最小フィールド */
export type FaqCategoryOption = {
  id: string;
  name: string;
};

export type FaqCategoryListResult = {
  categories: FaqCategoryWithItemCounts[];
  total: number;
};

/**
 * カテゴリ横断の「対応すべき件数」サマリー（管理画面ランディングのヘルス表示用）。
 * - draftCount: 下書き（非公開）項目
 * - staleCount: 長期間更新されていない公開項目（FAQ_STALE_DAYS 基準）
 * - lowRatedCount: 「役に立たなかった」票が付いた公開項目
 */
export type FaqHealthSummary = {
  draftCount: number;
  staleCount: number;
  lowRatedCount: number;
};

export type FaqItemListResult = {
  items: FaqItemWithCategory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FaqItemQuickFilter = "all" | "recent" | "stale" | "low-rated";

export type FaqItemSortBy =
  "order" | "updatedAt" | "viewCount" | "createdAt" | "helpful";
export type FaqItemSortOrder = "asc" | "desc";

export type FaqItemFilters = {
  categoryId?: string;
  search?: string;
  isPublished?: boolean;
  quickFilter?: FaqItemQuickFilter;
};

export type FaqItemSort = {
  sortBy: FaqItemSortBy;
  sortOrder: FaqItemSortOrder;
};

export type FaqItemPagination = PaginationInput;

export type FaqCategoryCommandInput = {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  isActive: boolean;
};

export type FaqItemCommandInput = {
  categoryId: string;
  question: string;
  answer: string;
  isPublished: boolean;
};

export type BulkFaqItemResult = { count: number; affectedIds: string[] };

export type CreateFaqCategoryResult = {
  id: string;
};

export type CreateFaqItemResult = {
  id: string;
};

export type UpdateFaqItemPublishedResult = {
  isPublished: boolean;
};
