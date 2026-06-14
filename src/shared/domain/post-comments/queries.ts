import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";
import type {
  AdminCommentData,
  CommentFilters,
  CommentStats,
  GetCommentsResult,
} from "@/shared/domain/post-comments/types";
import { toCommentAuthor } from "@/shared/lib/validations/comment";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

function toAdminCommentData(comment: {
  id: string;
  content: string;
  userId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  parentCommentId: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  user: { id: string; name: string | null } | null;
  post: {
    id: string;
    title: string;
    slug: string;
    publishedAt: Date | null;
    category: { slug: string } | null;
  };
}): AdminCommentData {
  return {
    id: comment.id,
    content: comment.content,
    author: toCommentAuthor(comment),
    postId: comment.post.id,
    postTitle: comment.post.title,
    postSlug: comment.post.slug,
    postUrl: buildPostCanonicalPath({
      slug: comment.post.slug,
      publishedAt: comment.post.publishedAt,
      category: comment.post.category,
    }),
    parentCommentId: comment.parentCommentId,
    isDeleted: comment.isDeleted,
    deletedAt: comment.deletedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
  };
}

export async function getAdminComments(
  filters: CommentFilters = {},
  pagination: { page?: number; limit?: number } = {},
): Promise<GetCommentsResult> {
  const { postId, status = "ALL", search } = filters;
  const page = pagination.page ?? 1;
  const limit = pagination.limit ?? 20;
  const skip = (page - 1) * limit;

  const where: Prisma.PostCommentWhereInput = {};

  if (postId) {
    where.postId = postId;
  }

  if (status === "ACTIVE") {
    where.isDeleted = false;
  } else if (status === "DELETED") {
    where.isDeleted = true;
  }

  if (search) {
    where.OR = [
      { content: { contains: search, mode: "insensitive" } },
      { guestName: { contains: search, mode: "insensitive" } },
      { guestEmail: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  try {
    const [total, comments] = await Promise.all([
      prisma.postComment.count({ where }),
      prisma.postComment.findMany({
        where,
        select: {
          id: true,
          content: true,
          userId: true,
          guestName: true,
          guestEmail: true,
          parentCommentId: true,
          isDeleted: true,
          deletedAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
          post: {
            select: {
              id: true,
              title: true,
              slug: true,
              publishedAt: true,
              category: {
                select: {
                  slug: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
    ]);

    return {
      comments: comments.map((comment) => toAdminCommentData(comment)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "getAdminComments", page, limit },
    });

    return {
      comments: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    };
  }
}

export async function getCommentStats(): Promise<CommentStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    const [total, todayCount, deleted] = await Promise.all([
      prisma.postComment.count(),
      prisma.postComment.count({
        where: {
          createdAt: { gte: today },
        },
      }),
      prisma.postComment.count({
        where: {
          isDeleted: true,
        },
      }),
    ]);

    return {
      total,
      today: todayCount,
      deleted,
    };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "getCommentStats" },
    });

    return {
      total: 0,
      today: 0,
      deleted: 0,
    };
  }
}

export async function getCommentCountByPost(postId: string): Promise<number> {
  try {
    return await prisma.postComment.count({
      where: {
        postId,
        isDeleted: false,
      },
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "getCommentCountByPost", postId },
    });

    return 0;
  }
}
