import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";

export async function createCommentThreadCommand(
  userId: string,
  input: {
    markId: string;
    contentType: string;
    contentId: string;
    quotedText: string;
    initialComment: string;
  },
) {
  const existingThread = await prisma.editorCommentThread.findUnique({
    where: {
      markId_contentType_contentId: {
        markId: input.markId,
        contentType: input.contentType,
        contentId: input.contentId,
      },
    },
    select: { id: true },
  });

  if (existingThread) {
    throw new DomainError(
      "このマークには既にコメントスレッドが存在します",
      "CONFLICT",
    );
  }

  return prisma.editorCommentThread.create({
    data: {
      markId: input.markId,
      contentType: input.contentType,
      contentId: input.contentId,
      quotedText: input.quotedText,
      createdBy: userId,
      comments: {
        create: {
          content: input.initialComment,
          createdBy: userId,
        },
      },
    },
    include: {
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          threadId: true,
          content: true,
          isDeleted: true,
          deletedAt: true,
          deletedBy: true,
          createdAt: true,
          updatedAt: true,
          createdBy: true,
        },
      },
    },
  });
}

export async function addCommentCommand(
  userId: string,
  input: { threadId: string; content: string },
) {
  const thread = await prisma.editorCommentThread.findUnique({
    where: { id: input.threadId },
    select: { id: true, status: true },
  });

  if (!thread) {
    throw new DomainError("コメントスレッドが見つかりません", "NOT_FOUND");
  }

  if (thread.status === "DELETED") {
    throw new DomainError(
      "削除されたスレッドにはコメントできません",
      "VALIDATION",
    );
  }

  return prisma.editorComment.create({
    data: {
      threadId: input.threadId,
      content: input.content,
      createdBy: userId,
    },
  });
}

export async function resolveThreadCommand(
  userId: string,
  threadId: string,
): Promise<void> {
  const thread = await prisma.editorCommentThread.findUnique({
    where: { id: threadId },
    select: { id: true, status: true },
  });

  if (!thread) {
    throw new DomainError("コメントスレッドが見つかりません", "NOT_FOUND");
  }

  if (thread.status === "RESOLVED") {
    throw new DomainError("このスレッドは既に解決済みです", "VALIDATION");
  }

  if (thread.status === "DELETED") {
    throw new DomainError("削除されたスレッドは操作できません", "VALIDATION");
  }

  await prisma.editorCommentThread.update({
    where: { id: threadId },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedBy: userId,
    },
  });
}

export async function reopenThreadCommand(threadId: string): Promise<void> {
  const thread = await prisma.editorCommentThread.findUnique({
    where: { id: threadId },
    select: { id: true, status: true },
  });

  if (!thread) {
    throw new DomainError("コメントスレッドが見つかりません", "NOT_FOUND");
  }

  if (thread.status === "ACTIVE") {
    throw new DomainError("このスレッドは既にアクティブです", "VALIDATION");
  }

  if (thread.status === "DELETED") {
    throw new DomainError("削除されたスレッドは操作できません", "VALIDATION");
  }

  await prisma.editorCommentThread.update({
    where: { id: threadId },
    data: {
      status: "ACTIVE",
      resolvedAt: null,
      resolvedBy: null,
    },
  });
}

export async function deleteThreadCommand(threadId: string): Promise<void> {
  const thread = await prisma.editorCommentThread.findUnique({
    where: { id: threadId },
    select: { id: true, status: true },
  });

  if (!thread) {
    throw new DomainError("コメントスレッドが見つかりません", "NOT_FOUND");
  }

  if (thread.status === "DELETED") {
    throw new DomainError(
      "このスレッドは既に削除されています",
      "VALIDATION",
    );
  }

  await prisma.editorCommentThread.update({
    where: { id: threadId },
    data: {
      status: "DELETED",
    },
  });
}

export async function deleteCommentCommand(
  userId: string,
  commentId: string,
): Promise<void> {
  const comment = await prisma.editorComment.findUnique({
    where: { id: commentId },
    select: { id: true, isDeleted: true },
  });

  if (!comment) {
    throw new DomainError("コメントが見つかりません", "NOT_FOUND");
  }

  if (comment.isDeleted) {
    throw new DomainError(
      "このコメントは既に削除されています",
      "VALIDATION",
    );
  }

  await prisma.editorComment.update({
    where: { id: commentId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: userId,
    },
  });
}
