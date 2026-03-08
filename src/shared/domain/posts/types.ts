import type { LayoutWidth, PostStatus } from "@/shared/db/enums";
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
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
  category: PostCategorySummaryRecord;
  author: PostAuthorRecord | null;
};

type PostVersionRecord = {
  id: string;
  postId: string;
  version: number;
  contentHtml: string;
  contentJson: unknown;
  createdAt: Date;
  createdBy: string | null;
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
export type PostVersionData = Serialized<PostVersionRecord>;
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
  status?: "ALL" | "PUBLISHED" | "DRAFT" | "ARCHIVED";
  categoryId?: string;
  search?: string;
};

export type PostPagination = {
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "publishedAt" | "viewCount";
  sortOrder?: "asc" | "desc";
};

type BasePostCommandInput = {
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
};

export type CreatePostCommandInput = BasePostCommandInput & {
  authorId: string;
};

export type UpdatePostCommandInput = BasePostCommandInput & {
  contentWidth: LayoutWidth | null;
  contentWidthCustom: number | null;
};

export type PostCategoryMutationInput = {
  name: string;
  slug: string;
  description?: string | null;
  order: number;
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
  version: number;
};

export type CreatePostBackupResult = {
  version: number;
};

export type RestorePostVersionResult = {
  slug: string;
};

export type CreatePostCategoryResult = {
  id: string;
};

export type CreatePostTagResult = {
  id: string;
};
