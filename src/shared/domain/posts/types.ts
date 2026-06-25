import type { LayoutWidth, PostStatus } from "@generated/prisma/enums";
import type { PaginationInput } from "@/shared/lib/pagination";
import type { Serialized } from "@/shared/lib/serialize";

type PostTagSummaryRecord = {
  id: string;
  name: string;
  slug: string;
};

type PostCategorySummaryRecord = {
  id: string;
  name: string;
  slug: string;
};

type PostAuthorRecord = {
  id: string;
  name: string | null;
  email: string;
};

type PostRecord = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  contentHtml: string;
  contentJson: unknown;
  thumbnailUrl: string;
  ogpImageUrl: string | null;
  categoryId: string;
  postTags: PostTagSummaryRecord[];
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  publishedAt: Date | null;
  status: PostStatus;
  createdAt: Date;
  updatedAt: Date;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  category: PostCategorySummaryRecord;
  author: PostAuthorRecord | null;
};

type PostCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  order: number;
  metaTitle: string | null;
  metaDescription: string | null;
  ogpImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    posts: number;
  };
};

type PostTagRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogpImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    posts: number;
  };
};

export type PostData = Serialized<PostRecord>;
export type PostListData = Omit<PostData, "contentHtml" | "contentJson">;
export type PostCategoryData = Serialized<PostCategoryRecord>;
export type PostTagData = Serialized<PostTagRecord>;

export type GetPostsResult = {
  posts: PostListData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PostFilters = {
  status?: "ALL" | "PUBLISHED" | "DRAFT" | "ARCHIVED" | undefined;
  categoryId?: string | undefined;
  search?: string | undefined;
};

export type PostPagination = PaginationInput<
  "createdAt" | "publishedAt" | "title"
>;

export type CreatePostCommandInput = {
  title: string;
  slug: string;
  excerpt: string;
  contentJson: string;
  contentHtml: string;
  thumbnailUrl: string;
  ogpImageUrl?: string | null;
  categoryId: string;
  tags: string[];
  metaDescription?: string | null;
  metaKeywords?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  authorId: string;
};

/**
 * 本文（contentJson / contentHtml）のみ更新するコマンド入力
 */
export type UpdatePostBodyCommandInput = {
  contentJson: string;
  contentHtml: string;
};

/**
 * 設定（メタデータ・分類・公開状態・レイアウト・SEO/OGP）を更新するコマンド入力
 *
 * 本文は含まない。
 */
export type UpdatePostSettingsCommandInput = {
  title: string;
  slug: string;
  excerpt: string;
  thumbnailUrl: string;
  ogpImageUrl?: string | null;
  categoryId: string;
  tags: string[];
  metaDescription?: string | null;
  metaKeywords?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
};

export type PostCategoryMutationInput = {
  name: string;
  slug: string;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogpImageUrl?: string | null;
};

export type PostTagMutationInput = {
  name: string;
  slug: string;
  description?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogpImageUrl?: string | null;
};

export type CreatePostResult = {
  id: string;
  slug: string;
};

export type UpdatePostResult = {
  oldSlug: string;
  slug: string;
};

export type DeletePostResult = {
  slug: string;
};

export type PublishPostResult = {
  slug: string;
};

export type CreatePostCategoryResult = {
  id: string;
};

export type CreatePostTagResult = {
  id: string;
};
