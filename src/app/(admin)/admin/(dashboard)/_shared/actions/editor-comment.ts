"use server";

import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { withPermission } from "@/admin/lib/server-action-helpers";
import { createFailure, createSuccess } from "@/admin/types/server-actions";
import type {
  AddCommentInput,
  CommentableContentType,
  CreateThreadInput,
  EditorCommentThread,
  GetThreadsQuery,
  MarkInfo,
  ThreadListItem,
} from "@/admin/types/editor-comment";
import { isCommentableContentType } from "@/admin/types/editor-comment";
import { createValidationError } from "@/shared/lib/action-helpers";
import {
  addCommentCommand,
  createCommentThreadCommand,
  deleteCommentCommand,
  deleteThreadCommand,
  reopenThreadCommand,
  resolveThreadCommand,
} from "@/shared/domain/editor-comments/commands";
import {
  getCommentThreadsQuery,
  getMarkInfoListQuery,
  getThreadDetailQuery,
} from "@/shared/domain/editor-comments/queries";

const createThreadSchema = z.object({
  markId: z.string().min(1, { error: "markId は必須です" }),
  contentType: z
    .string()
    .refine(isCommentableContentType, { error: "contentType が無効です" }),
  contentId: z
    .string()
    .uuid({ error: "contentId は有効な UUID である必要があります" }),
  quotedText: z
    .string()
    .min(1, { error: "引用テキストは必須です" })
    .max(2000, { error: "引用テキストは2000文字以内" }),
  initialComment: z
    .string()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});

const addCommentSchema = z.object({
  threadId: z
    .string()
    .uuid({ error: "threadId は有効な UUID である必要があります" }),
  content: z
    .string()
    .min(1, { error: "コメントは必須です" })
    .max(5000, { error: "コメントは5000文字以内" }),
});

export const createCommentThread = async (input: CreateThreadInput) => {
  const validation = createThreadSchema.safeParse(input);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "update",
    execute: async (user) =>
      createCommentThreadCommand(user.id, validation.data),
    success: (thread) =>
      createSuccess("コメントスレッドを作成しました", thread),
    resolveAuditResourceId: (thread) => thread.id,
  });
};

export const addComment = async (input: AddCommentInput) => {
  const validation = addCommentSchema.safeParse(input);
  if (!validation.success) {
    return createValidationError(validation.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "update",
    execute: async (user) => addCommentCommand(user.id, validation.data),
    success: (comment) => createSuccess("コメントを追加しました", comment),
    resolveAuditResourceId: (comment) => comment.id,
  });
};

export const resolveThread = async (threadId: string) =>
  executeAdminMutation<void>({
    resource: "post",
    action: "update",
    resourceId: threadId,
    execute: async (user) => {
      await resolveThreadCommand(user.id, threadId);
    },
    success: () => createSuccess("スレッドを解決しました"),
  });

export const reopenThread = async (threadId: string) =>
  executeAdminMutation<void>({
    resource: "post",
    action: "update",
    resourceId: threadId,
    execute: async () => {
      await reopenThreadCommand(threadId);
    },
    success: () => createSuccess("スレッドを再オープンしました"),
  });

export const deleteThread = async (threadId: string) =>
  executeAdminMutation<void>({
    resource: "post",
    action: "delete",
    resourceId: threadId,
    execute: async () => {
      await deleteThreadCommand(threadId);
    },
    success: () => createSuccess("スレッドを削除しました"),
  });

export const deleteComment = async (commentId: string) =>
  executeAdminMutation<void>({
    resource: "post",
    action: "delete",
    resourceId: commentId,
    execute: async (user) => {
      await deleteCommentCommand(user.id, commentId);
    },
    success: () => createSuccess("コメントを削除しました"),
  });

export const getCommentThreads = withPermission<
  [GetThreadsQuery],
  ThreadListItem[]
>("post", "read", { audit: false })(async (_user, query) => {
  const { contentType, contentId, status } = query;
  if (!isCommentableContentType(contentType)) {
    return createFailure("無効なコンテンツタイプです");
  }

  return createSuccess(
    "スレッド一覧を取得しました",
    await getCommentThreadsQuery({ contentType, contentId, status }),
  );
});

export const getThreadDetail = withPermission<[string], EditorCommentThread>(
  "post",
  "read",
  { audit: false },
)(async (_user, threadId) => {
  const thread = await getThreadDetailQuery(threadId);
  return createSuccess("スレッド詳細を取得しました", thread);
});

export const getMarkInfoList = withPermission<
  [CommentableContentType, string],
  MarkInfo[]
>("post", "read", { audit: false })(async (_user, contentType, contentId) => {
  return createSuccess(
    "マーク情報を取得しました",
    await getMarkInfoListQuery(contentType, contentId),
  );
});
