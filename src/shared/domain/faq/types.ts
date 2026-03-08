import type { Serialized } from "@/shared/lib/serialize";

type FaqItemRecord = {
  id: string;
  categoryId: string;
  question: string;
  answerHtml: string;
  answerJson: unknown;
  order: number;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
};

type FaqCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  order: number;
  isActive: boolean;
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

export type FaqItemFilters = {
  categoryId?: string;
  search?: string;
  isPublished?: boolean;
};

export type FaqItemPagination = {
  page?: number;
  limit?: number;
};

export type FaqCategoryCommandInput = {
  name: string;
  slug: string;
  description?: string | null;
  order: number;
  isActive: boolean;
};

export type FaqItemCommandInput = {
  categoryId: string;
  question: string;
  answerJson: string;
  answerHtml: string;
  order: number;
  isPublished: boolean;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  ogpImageUrl?: string | null;
};

export type CreateFaqCategoryResult = {
  id: string;
};

export type CreateFaqItemResult = {
  id: string;
};

export type ToggleFaqItemPublishedResult = {
  isPublished: boolean;
};
