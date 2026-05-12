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

export type FaqItemListResult = {
  items: FaqItemWithCategory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type FaqItemQuickFilter = "all" | "drafts" | "recent" | "stale";

export type FaqItemSortBy = "order" | "updatedAt" | "viewCount" | "createdAt";
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
  order: number;
  isActive: boolean;
};

export type FaqItemCommandInput = {
  categoryId: string;
  question: string;
  answer: string;
  order: number;
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
