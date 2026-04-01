"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createPostSchema,
  updatePostSchema,
  type CreatePostInput,
  type UpdatePostInput,
} from "@/admin/lib/validations/post";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  createPost as createPostCommand,
  deletePost as deletePostCommand,
  publishPost as publishPostCommand,
  unpublishPost as unpublishPostCommand,
  updatePost as updatePostCommand,
} from "@/shared/domain/posts/commands";
import { getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  invalidatePostCollectionCaches,
  purgePostCaches,
} from "./cache-helpers";

const idSchema = z.string().uuid({ error: "投稿IDが不正です" });

export async function createPost(
  input: CreatePostInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    parsed.data.contentJson,
  );
  let createdPostSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async (user) => {
      const result = await createPostCommand(
        omitUndefined({
          ...parsed.data,
          contentHtml,
          authorId: user.id,
        }),
      );
      createdPostSlug = result.slug;
      return { id: result.id };
    },
    afterSuccess: async () => {
      await invalidatePostCollectionCaches();
      await purgePostCaches(createdPostSlug ?? undefined);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePost(
  id: string,
  input: UpdatePostInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updatePostSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    parsed.data.contentJson,
  );
  let updatedPost: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedPost = await updatePostCommand(
        validatedId.data,
        omitUndefined({
          ...parsed.data,
          contentHtml,
          contentWidth: parsed.data.contentWidth ?? null,
          contentWidthCustom: parsed.data.contentWidthCustom ?? null,
        }),
      );
      return null;
    },
    afterSuccess: async () => {
      if (!updatedPost) {
        return;
      }

      await invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(updatedPost.oldSlug));
      if (updatedPost.slug !== updatedPost.oldSlug) {
        updateTag(getCacheTag.posts.detail(updatedPost.slug));
      }
      await purgePostCaches(updatedPost.oldSlug, updatedPost.slug);
    },
  });
}

export async function deletePost(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let deletedPostSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      const result = await deletePostCommand(validated.data);
      deletedPostSlug = result.slug;
      return null;
    },
    afterSuccess: async () => {
      if (!deletedPostSlug) {
        return;
      }

      await invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(deletedPostSlug));
      await purgePostCaches(deletedPostSlug);
    },
  });
}

export async function publishPost(
  id: string,
): Promise<MutationResult<{ version: number }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let publishedPost: { slug: string; version: number } | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    resourceId: validated.data,
    execute: async (user) => {
      publishedPost = await publishPostCommand(validated.data, user.id);
      return { version: publishedPost.version };
    },
    afterSuccess: async () => {
      if (!publishedPost) {
        return;
      }

      await invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(publishedPost.slug));
      await purgePostCaches(publishedPost.slug);
    },
  });
}

export async function unpublishPost(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let unpublishedPostSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      const result = await unpublishPostCommand(validated.data);
      unpublishedPostSlug = result.slug;
      return null;
    },
    afterSuccess: async () => {
      if (!unpublishedPostSlug) {
        return;
      }

      await invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(unpublishedPostSlug));
      await purgePostCaches(unpublishedPostSlug);
    },
  });
}
