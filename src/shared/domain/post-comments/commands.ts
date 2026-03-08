import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

type CommentWithPostSlug = {
  id: string;
  isDeleted: boolean;
  post: { slug: string };
};

async function getCommentOrThrow(commentId: string): Promise<CommentWithPostSlug> {
  const comment = await prisma.postComment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      isDeleted: true,
      post: { select: { slug: true } },
    },
  });

  if (!comment) {
    throw new DomainError("コメントが見つかりません", "NOT_FOUND");
  }

  return comment;
}

export async function deleteComment(
  commentId: string,
  deletedBy: string,
): Promise<{ postSlug: string }> {
  try {
    const comment = await getCommentOrThrow(commentId);

    await prisma.postComment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
      },
    });

    return { postSlug: comment.post.slug };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deletePostComment", commentId },
    });

    throw new DomainError("コメントの削除中にエラーが発生しました");
  }
}

export async function deleteComments(
  commentIds: string[],
  deletedBy: string,
): Promise<{ count: number; postSlugs: string[] }> {
  if (commentIds.length === 0) {
    throw new DomainError("削除するコメントを選択してください", "VALIDATION");
  }

  try {
    const comments = await prisma.postComment.findMany({
      where: { id: { in: commentIds } },
      select: {
        post: { select: { slug: true } },
      },
    });

    const postSlugs = [...new Set(comments.map((comment) => comment.post.slug))];

    const result = await prisma.postComment.updateMany({
      where: { id: { in: commentIds } },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
      },
    });

    return { count: result.count, postSlugs };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deletePostComments", commentCount: commentIds.length },
    });

    throw new DomainError("コメントの削除中にエラーが発生しました");
  }
}

export async function restoreComment(
  commentId: string,
): Promise<{ postSlug: string }> {
  try {
    const comment = await getCommentOrThrow(commentId);
    if (!comment.isDeleted) {
      throw new DomainError("このコメントは削除されていません", "CONFLICT");
    }

    await prisma.postComment.update({
      where: { id: commentId },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    });

    return { postSlug: comment.post.slug };
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }

    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "restorePostComment", commentId },
    });

    throw new DomainError("コメントの復元中にエラーが発生しました");
  }
}
