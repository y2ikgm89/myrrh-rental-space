"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type {
  AddCommentInput,
  CreateThreadInput,
} from "@/admin/types/editor-comment";
import { isCommentableContentType } from "@/admin/types/editor-comment";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  addCommentCommand,
  createCommentThreadCommand,
  deleteCommentCommand,
  deleteThreadCommand,
  reopenThreadCommand,
  resolveThreadCommand,
} from "@/shared/domain/editor-comments/commands";

const idSchema = z.string().uuid({ error: "IDが不正です" });

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

export async function createCommentThread(
  input: CreateThreadInput,
): Promise<
  MutationResult<Awaited<ReturnType<typeof createCommentThreadCommand>>>
> {
  const validation = createThreadSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    execute: async (user) =>
      createCommentThreadCommand(user.id, validation.data),
    resolveAuditResourceId: (thread) => thread.id,
  });
}

export async function addComment(
  input: AddCommentInput,
): Promise<MutationResult<Awaited<ReturnType<typeof addCommentCommand>>>> {
  const validation = addCommentSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    execute: async (user) => addCommentCommand(user.id, validation.data),
    resolveAuditResourceId: (comment) => comment.id,
  });
}

export async function resolveThread(threadId: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(threadId);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: parsed.data,
    execute: async (user) => {
      await resolveThreadCommand(user.id, parsed.data);
      return null;
    },
  });
}

export async function reopenThread(threadId: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(threadId);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: parsed.data,
    execute: async () => {
      await reopenThreadCommand(parsed.data);
      return null;
    },
  });
}

export async function deleteThread(threadId: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(threadId);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    resourceId: parsed.data,
    execute: async () => {
      await deleteThreadCommand(parsed.data);
      return null;
    },
  });
}

export async function deleteComment(
  commentId: string,
): Promise<MutationResult> {
  const parsed = idSchema.safeParse(commentId);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    resourceId: parsed.data,
    execute: async (user) => {
      await deleteCommentCommand(user.id, parsed.data);
      return null;
    },
  });
}
