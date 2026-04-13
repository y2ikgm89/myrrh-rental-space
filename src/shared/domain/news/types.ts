import type { LayoutWidth } from "@generated/prisma/enums";
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
  status?: "ALL" | "PUBLISHED" | "DRAFT" | undefined;
  search?: string | undefined;
};

export type NewsPagination = {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "publishedAt";
  sortOrder?: "asc" | "desc";
};

export type CreateNewsCommandInput = {
  slug: string;
  title: string;
  contentJson: string;
  contentHtml: string;
};

/**
 * 本文（contentJson / contentHtml）のみ更新するコマンド入力
 */
export type UpdateNewsBodyCommandInput = {
  contentJson: string;
  contentHtml: string;
};

/**
 * 設定（メタデータ・公開状態・レイアウト・SEO/OGP）を更新するコマンド入力
 *
 * 本文は含まない。
 */
export type UpdateNewsSettingsCommandInput = {
  slug: string;
  title: string;
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
