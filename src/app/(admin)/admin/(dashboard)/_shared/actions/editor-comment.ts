"use server";

import { executeEditorCommentMutationResult } from "@/admin/lib/editor-comment-auth";
import type {
  AddCommentInput,
  CreateThreadInput,
} from "@/admin/types/editor-comment";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import {
  addEditorCommentSchema,
  createEditorCommentThreadSchema,
} from "@/admin/lib/validations/editor-comment";
import {
  addCommentCommand,
  createCommentThreadCommand,
  deleteCommentCommand,
  deleteThreadCommand,
  reopenThreadCommand,
  resolveThreadCommand,
} from "@/shared/domain/editor-comments/commands";

const idSchema = uuidIdSchema("コメント");

export async function createCommentThread(
  input: CreateThreadInput,
): Promise<
  MutationResult<Awaited<ReturnType<typeof createCommentThreadCommand>>>
> {
  const validation = createEditorCommentThreadSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeEditorCommentMutationResult({
    action: "update",
    contentRef: {
      kind: "content",
      contentType: validation.data.contentType,
      contentId: validation.data.contentId,
    },
    execute: async (user) =>
      createCommentThreadCommand(user.id, validation.data),
    resolveAuditResourceId: (thread) => thread.id,
  });
}

export async function addComment(
  input: AddCommentInput,
): Promise<MutationResult<Awaited<ReturnType<typeof addCommentCommand>>>> {
  const validation = addEditorCommentSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeEditorCommentMutationResult({
    action: "update",
    contentRef: { kind: "thread", threadId: validation.data.threadId },
    execute: async (user) => addCommentCommand(user.id, validation.data),
    resolveAuditResourceId: (comment) => comment.id,
  });
}

export async function resolveThread(threadId: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(threadId);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeEditorCommentMutationResult({
    action: "update",
    contentRef: { kind: "thread", threadId: parsed.data },
    execute: async (user) => {
      await resolveThreadCommand(user.id, parsed.data);
      return null;
    },
  });
}

export async function reopenThread(threadId: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(threadId);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeEditorCommentMutationResult({
    action: "update",
    contentRef: { kind: "thread", threadId: parsed.data },
    execute: async () => {
      await reopenThreadCommand(parsed.data);
      return null;
    },
  });
}

export async function deleteThread(threadId: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(threadId);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeEditorCommentMutationResult({
    action: "delete",
    contentRef: { kind: "thread", threadId: parsed.data },
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

  return executeEditorCommentMutationResult({
    action: "delete",
    contentRef: { kind: "comment", commentId: parsed.data },
    execute: async (user) => {
      await deleteCommentCommand(user.id, parsed.data);
      return null;
    },
  });
}
