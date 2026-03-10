import type { CommentAuthor } from "@/shared/lib/validations/comment";

export type AdminCommentData = {
  id: string;
  content: string;
  author: CommentAuthor;
  postId: string;
  postTitle: string;
  postSlug: string;
  postUrl: string;
  parentCommentId: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
};

export type GetCommentsResult = {
  comments: AdminCommentData[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CommentFilters = {
  postId?: string | undefined;
  status?: "ALL" | "ACTIVE" | "DELETED";
  search?: string | undefined;
};

export type CommentStats = {
  total: number;
  today: number;
  deleted: number;
};
