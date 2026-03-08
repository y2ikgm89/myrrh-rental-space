import type { LayoutWidth } from "@/shared/db/enums";
import type { Serialized } from "@/shared/lib/serialize";

type NewsRecord = {
  id: string;
  slug: string;
  title: string;
  contentHtml: string;
  contentJson: unknown;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
};

type NewsVersionRecord = {
  id: string;
  newsId: string;
  version: number;
  contentHtml: string;
  contentJson: unknown;
  createdAt: Date;
  createdBy: string | null;
};

export type NewsData = Serialized<NewsRecord>;
export type NewsVersionData = Serialized<NewsVersionRecord>;
export type NewsListItem = NewsData & {
  publishedAtLabel: string | null;
  createdAtLabel: string;
};

export type GetNewsListResult = {
  news: NewsListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type NewsFilters = {
  status?: "ALL" | "PUBLISHED" | "DRAFT";
  search?: string;
};

export type NewsPagination = {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "publishedAt";
  sortOrder?: "asc" | "desc";
};

type BaseNewsCommandInput = {
  slug: string;
  title: string;
  contentJson: string;
  contentHtml: string;
};

export type CreateNewsCommandInput = BaseNewsCommandInput;

export type UpdateNewsCommandInput = BaseNewsCommandInput & {
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  ogpImageUrl?: string | null;
};

export type CreateNewsResult = {
  id: string;
  slug: string;
};

export type UpdateNewsResult = {
  oldSlug: string;
  slug: string;
};

export type DeleteNewsResult = {
  slug: string;
};

export type PublishNewsResult = {
  slug: string;
  version: number;
};

export type CreateNewsBackupResult = {
  version: number;
};

export type RestoreNewsVersionResult = {
  slug: string;
};
