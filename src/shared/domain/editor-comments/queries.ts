import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { EditorCommentStatus } from "@/shared/db/enums";
import type { EditorCommentThread, MarkInfo, ThreadListItem } from "./types";

export async function getCommentThreadsQuery(input: {
  contentType: string;
  contentId: string;
  status?: EditorCommentStatus;
}): Promise<ThreadListItem[]> {
  const threads = await prisma.editorCommentThread.findMany({
    where: {
      contentType: input.contentType,
      contentId: input.contentId,
      ...(input.status
        ? { status: input.status }
        : { status: { not: "DELETED" } }),
    },
    select: {
      id: true,
      markId: true,
      quotedText: true,
      status: true,
      createdAt: true,
      createdBy: true,
      comments: {
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          content: true,
          createdAt: true,
          createdBy: true,
        },
      },
      _count: {
        select: {
          comments: {
            where: { isDeleted: false },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const userIds = [
    ...new Set(
      [
        ...threads.map((thread) => thread.createdBy),
        ...threads.flatMap((thread) =>
          thread.comments.map((comment) => comment.createdBy),
        ),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });
  const userMap = new Map(users.map((user) => [user.id, user]));

  return threads.map((thread) => {
    const latestComment = thread.comments[0];

    return {
      id: thread.id,
      markId: thread.markId,
      quotedText: thread.quotedText,
      status: thread.status,
      commentCount: thread._count.comments,
      latestComment: latestComment
        ? {
            content: latestComment.content,
            createdAt: latestComment.createdAt,
            createdByName:
              latestComment.createdBy && userMap.has(latestComment.createdBy)
                ? (userMap.get(latestComment.createdBy)?.name ?? "不明")
                : "不明",
          }
        : undefined,
      createdAt: thread.createdAt,
      createdByName:
        thread.createdBy && userMap.has(thread.createdBy)
          ? (userMap.get(thread.createdBy)?.name ?? "不明")
          : "不明",
    };
  });
}

export async function getThreadDetailQuery(
  threadId: string,
): Promise<EditorCommentThread> {
  const thread = await prisma.editorCommentThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      markId: true,
      contentType: true,
      contentId: true,
      quotedText: true,
      status: true,
      resolvedAt: true,
      resolvedBy: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      comments: {
        where: { isDeleted: false },
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

  if (!thread) {
    throw new DomainError("コメントスレッドが見つかりません", "NOT_FOUND");
  }

  const userIds = [
    thread.createdBy,
    thread.resolvedBy,
    ...thread.comments.map((comment) => comment.createdBy),
  ].filter((id): id is string => id !== null);
  const uniqueUserIds = [...new Set(userIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueUserIds } },
    select: { id: true, name: true, image: true },
  });
  const userMap = new Map(users.map((user) => [user.id, user]));

  return {
    ...thread,
    comments: thread.comments.map((comment) => ({
      ...comment,
      createdByUser: comment.createdBy
        ? userMap.get(comment.createdBy)
        : undefined,
    })),
    createdByUser: thread.createdBy ? userMap.get(thread.createdBy) : undefined,
    resolvedByUser: thread.resolvedBy ? userMap.get(thread.resolvedBy) : null,
  };
}

export async function getMarkInfoListQuery(
  contentType: string,
  contentId: string,
): Promise<MarkInfo[]> {
  const threads = await prisma.editorCommentThread.findMany({
    where: {
      contentType,
      contentId,
      status: { not: "DELETED" },
    },
    select: {
      id: true,
      markId: true,
      status: true,
      _count: {
        select: {
          comments: {
            where: { isDeleted: false },
          },
        },
      },
    },
  });

  return threads.map((thread) => ({
    markId: thread.markId,
    threadId: thread.id,
    status: thread.status,
    commentCount: thread._count.comments,
  }));
}
