"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  postCategorySchema,
  postTagSchema,
  type PostCategoryInput,
  type PostTagInput,
} from "@/admin/lib/validations/post";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  createPostCategory as createPostCategoryCommand,
  createPostTag as createPostTagCommand,
  deletePostCategory as deletePostCategoryCommand,
  deletePostTag as deletePostTagCommand,
  updatePostCategory as updatePostCategoryCommand,
  updatePostCategoryOrder as updatePostCategoryOrderCommand,
  updatePostTag as updatePostTagCommand,
} from "@/shared/domain/posts/commands";
import { CACHE_TAGS } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  invalidatePostCategoryCaches,
  invalidatePostTagCaches,
  purgePostArchive,
} from "./cache-helpers";

const idSchema = z.string().uuid({ error: "カテゴリ/タグIDが不正です" });
const postCategoryOrderSchema = z.array(
  z.object({
    id: z.string().uuid({ error: "カテゴリIDが不正です" }),
    order: z.number().int().min(0, { error: "順序が不正です" }),
  }),
);

export async function createPostCategory(
  input: PostCategoryInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = postCategorySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => createPostCategoryCommand(omitUndefined(parsed.data)),
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePostCategory(
  id: string,
  input: PostCategoryInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = postCategorySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updatePostCategoryCommand(
        validatedId.data,
        omitUndefined(parsed.data),
      );
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
  });
}

export async function deletePostCategory(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deletePostCategoryCommand(validated.data);
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
  });
}

export async function updatePostCategoryOrder(
  items: { id: string; order: number }[],
): Promise<MutationResult> {
  const parsed = postCategoryOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    execute: async () => {
      await updatePostCategoryOrderCommand(parsed.data);
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostCategoryCaches();
      await purgePostArchive();
    },
  });
}

export async function createPostTag(
  input: PostTagInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = postTagSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async () => createPostTagCommand(omitUndefined(parsed.data)),
    afterSuccess: async () => {
      await invalidatePostTagCaches();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePostTag(
  id: string,
  input: PostTagInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = postTagSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      await updatePostTagCommand(validatedId.data, omitUndefined(parsed.data));
      return null;
    },
    afterSuccess: async () => {
      await invalidatePostTagCaches();
      await purgePostArchive();
    },
  });
}

export async function deletePostTag(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deletePostTagCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POST_TAGS);
    },
  });
}
