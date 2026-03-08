import "server-only";

import { z } from "zod";
import {
  getAdminComments as getAdminCommentsQuery,
  getCommentCountByPost as getCommentCountByPostQuery,
  getCommentStats as getCommentStatsQuery,
} from "@/shared/domain/post-comments/queries";
import type {
  CommentFilters,
  CommentStats,
  GetCommentsResult,
} from "@/shared/domain/post-comments/types";
import { requireAdminPermission } from "./_helpers";

const commentIdSchema = z.string().uuid({ error: "コメントIDが不正です" });

export type {
  AdminCommentData,
  CommentFilters,
  CommentStats,
  GetCommentsResult,
} from "@/shared/domain/post-comments/types";

export async function getAdminComments(
  filters: CommentFilters = {},
  pagination: { page?: number; limit?: number } = {},
): Promise<GetCommentsResult> {
  await requireAdminPermission("post", "read");
  return getAdminCommentsQuery(filters, pagination);
}

export async function getCommentStats(): Promise<CommentStats> {
  await requireAdminPermission("post", "read");
  return getCommentStatsQuery();
}

export async function getCommentCountByPost(postId: string): Promise<number> {
  await requireAdminPermission("post", "read");

  const validated = commentIdSchema.safeParse(postId);
  if (!validated.success) {
    return 0;
  }

  return getCommentCountByPostQuery(validated.data);
}
