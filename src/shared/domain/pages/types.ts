import type { LayoutWidth } from "@/shared/db/enums";

type DateLike = Date | string;

export type PageData = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
  isPublished: boolean;
  publishedAt: DateLike | null;
  isActive: boolean;
  isSystemPage: boolean;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  showSidebar: boolean | null;
  sectionCount?: number | undefined;
  createdAt: DateLike;
  updatedAt: DateLike;
};

export type PageListResult = {
  pages: PageData[];
  total: number;
  page: number;
  perPage: number;
};
