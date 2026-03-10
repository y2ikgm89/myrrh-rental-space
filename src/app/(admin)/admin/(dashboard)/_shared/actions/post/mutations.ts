"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createPostSchema,
  updatePostSchema,
  postCategorySchema,
  postTagSchema,
  type CreatePostInput,
  type UpdatePostInput,
  type PostCategoryInput,
  type PostTagInput,
} from "@/admin/lib/validations/post";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  createPost as createPostCommand,
  createPostBackup as createPostBackupCommand,
  createPostCategory as createPostCategoryCommand,
  createPostTag as createPostTagCommand,
  deletePost as deletePostCommand,
  deletePostCategory as deletePostCategoryCommand,
  deletePostTag as deletePostTagCommand,
  publishPost as publishPostCommand,
  restorePostVersion as restorePostVersionCommand,
  unpublishPost as unpublishPostCommand,
  updatePost as updatePostCommand,
  updatePostCategory as updatePostCategoryCommand,
  updatePostCategoryOrder as updatePostCategoryOrderCommand,
  updatePostTag as updatePostTagCommand,
} from "@/shared/domain/posts/commands";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgePostCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";

const idSchema = z.string().uuid({ error: "投稿IDが不正です" });
const versionSchema = z.object({
  postId: z.string().uuid({ error: "投稿IDが不正です" }),
  version: z.number().int().positive({ error: "バージョンが不正です" }),
});
const postCategoryOrderSchema = z.array(
  z.object({
    id: z.string().uuid({ error: "カテゴリIDが不正です" }),
    order: z.number().int().min(0, { error: "順序が不正です" }),
  }),
);

function purgePostCaches(...slugs: Array<string | undefined>): void {
  const uniqueSlugs = [
    ...new Set(slugs.filter((slug): slug is string => Boolean(slug))),
  ];

  for (const slug of uniqueSlugs) {
    fireAndForget(purgePostCache(slug), {
      operation: "purgePostCache",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
    });
  }
}

function purgePostArchive(): void {
  fireAndForget(purgePostCache(), {
    operation: "purgePostCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

function invalidatePostCollectionCaches(): void {
  updateTag(CACHE_TAGS.POSTS);
}

function invalidatePostCategoryCaches(): void {
  updateTag(CACHE_TAGS.POSTS);
  updateTag(CACHE_TAGS.POST_CATEGORIES);
}

function invalidatePostTagCaches(): void {
  updateTag(CACHE_TAGS.POSTS);
  updateTag(CACHE_TAGS.POST_TAGS);
}

export async function createPost(
  input: CreatePostInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : "";
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
    afterSuccess: () => {
      invalidatePostCollectionCaches();
      purgePostCaches(createdPostSlug ?? undefined);
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
    afterSuccess: () => {
      if (!updatedPost) {
        return;
      }

      invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(updatedPost.oldSlug));
      if (updatedPost.slug !== updatedPost.oldSlug) {
        updateTag(getCacheTag.posts.detail(updatedPost.slug));
      }
      purgePostCaches(updatedPost.oldSlug, updatedPost.slug);
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
    afterSuccess: () => {
      if (!deletedPostSlug) {
        return;
      }

      invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(deletedPostSlug));
      purgePostCaches(deletedPostSlug);
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
    afterSuccess: () => {
      if (!publishedPost) {
        return;
      }

      invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(publishedPost.slug));
      purgePostCaches(publishedPost.slug);
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
    afterSuccess: () => {
      if (!unpublishedPostSlug) {
        return;
      }

      invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(unpublishedPostSlug));
      purgePostCaches(unpublishedPostSlug);
    },
  });
}

export async function createPostBackup(
  id: string,
): Promise<MutationResult<{ version: number }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => createPostBackupCommand(validated.data, user.id),
  });
}

export async function restorePostVersion(
  postId: string,
  version: number,
): Promise<MutationResult<{ version: number }>> {
  const parsed = versionSchema.safeParse({ postId, version });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let restoredPostSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: parsed.data.postId,
    execute: async () => {
      const result = await restorePostVersionCommand(
        parsed.data.postId,
        parsed.data.version,
      );
      restoredPostSlug = result.slug;
      return { version: parsed.data.version };
    },
    afterSuccess: () => {
      if (!restoredPostSlug) {
        return;
      }

      invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(restoredPostSlug));
      purgePostCaches(restoredPostSlug);
    },
  });
}

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
    afterSuccess: () => {
      invalidatePostCategoryCaches();
      purgePostArchive();
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
    afterSuccess: () => {
      invalidatePostCategoryCaches();
      purgePostArchive();
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
    afterSuccess: () => {
      invalidatePostCategoryCaches();
      purgePostArchive();
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
    afterSuccess: () => {
      invalidatePostCategoryCaches();
      purgePostArchive();
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
    afterSuccess: () => {
      invalidatePostTagCaches();
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
    afterSuccess: () => {
      invalidatePostTagCaches();
      purgePostArchive();
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
