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
  iconEmoji: string | null;
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

export type FaqItemData = Serialized<FaqItemRecord>;
export type FaqCategoryWithItems = Serialized<FaqCategoryRecord>;
export type FaqItemWithCategory = Serialized<FaqItemWithCategoryRecord>;

export type FaqCategoryListResult = {
  categories: FaqCategoryWithItems[];
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
  | "order"
  | "updatedAt"
  | "viewCount"
  | "createdAt"
  | "helpful";
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

export type FaqItemPagination = {
  page?: number;
  limit?: number;
};

export type FaqCategoryCommandInput = {
  name: string;
  slug: string;
  description?: string | null;
  iconEmoji?: string | null;
  isActive: boolean;
};

export type FaqItemCommandInput = {
  categoryId: string;
  question: string;
  answer: string;
  isPublished: boolean;
};

export type BulkFaqItemResult = { count: number };

export type CreateFaqCategoryResult = {
  id: string;
};

export type CreateFaqItemResult = {
  id: string;
};

export type UpdateFaqItemPublishedResult = {
  isPublished: boolean;
};
