"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
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
import { createValidationError } from "@/shared/lib/action-helpers";
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
  const uniqueSlugs = [...new Set(slugs.filter((slug): slug is string => Boolean(slug)))];

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
): Promise<ActionResult<{ id: string }>> {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : "";
  let createdPostSlug: string | null = null;

  return executeAdminMutation({
    resource: "post",
    action: "create",
    execute: async (user) => {
      const result = await createPostCommand({
        ...parsed.data,
        contentHtml,
        authorId: user.id,
      });
      createdPostSlug = result.slug;
      return { id: result.id };
    },
    success: (result) => createSuccess("投稿記事を作成しました", result),
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
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = updatePostSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(parsed.data.contentJson);
  let updatedPost: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutation({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedPost = await updatePostCommand(validatedId.data, {
        ...parsed.data,
        contentHtml,
        contentWidth: parsed.data.contentWidth ?? null,
        contentWidthCustom: parsed.data.contentWidthCustom ?? null,
      });
    },
    success: () => createSuccess("投稿記事を保存しました"),
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

export async function deletePost(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  let deletedPostSlug: string | null = null;

  return executeAdminMutation({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      const result = await deletePostCommand(validated.data);
      deletedPostSlug = result.slug;
    },
    success: () => createSuccess("投稿記事を削除しました"),
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

export async function publishPost(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  let publishedPost: { slug: string; version: number } | null = null;

  return executeAdminMutation({
    resource: "post",
    action: "publish",
    resourceId: validated.data,
    execute: async (user) => {
      publishedPost = await publishPostCommand(validated.data, user.id);
    },
    success: () =>
      createSuccess(
        `公開しました（バージョン ${publishedPost?.version ?? 0}）`,
      ),
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

export async function unpublishPost(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  let unpublishedPostSlug: string | null = null;

  return executeAdminMutation({
    resource: "post",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      const result = await unpublishPostCommand(validated.data);
      unpublishedPostSlug = result.slug;
    },
    success: () => createSuccess("下書きに戻しました"),
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
): Promise<ActionResult<{ version: number }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => createPostBackupCommand(validated.data, user.id),
    success: (result) =>
      createSuccess(
        `バックアップを作成しました（バージョン ${result.version}）`,
        { version: result.version },
      ),
  });
}

export async function restorePostVersion(
  postId: string,
  version: number,
): Promise<ActionResult<void>> {
  const parsed = versionSchema.safeParse({ postId, version });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  let restoredPostSlug: string | null = null;

  return executeAdminMutation({
    resource: "post",
    action: "update",
    resourceId: parsed.data.postId,
    execute: async () => {
      const result = await restorePostVersionCommand(
        parsed.data.postId,
        parsed.data.version,
      );
      restoredPostSlug = result.slug;
    },
    success: () =>
      createSuccess(
        `バージョン ${parsed.data.version} を復元しました（下書き状態）`,
      ),
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
): Promise<ActionResult<{ id: string }>> {
  const parsed = postCategorySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "create",
    execute: async () => createPostCategoryCommand(parsed.data),
    success: (result) => createSuccess("カテゴリを作成しました", result),
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
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = postCategorySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => updatePostCategoryCommand(validatedId.data, parsed.data),
    success: () => createSuccess("カテゴリを更新しました"),
    afterSuccess: () => {
      invalidatePostCategoryCaches();
      purgePostArchive();
    },
  });
}

export async function deletePostCategory(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deletePostCategoryCommand(validated.data),
    success: () => createSuccess("カテゴリを削除しました"),
    afterSuccess: () => {
      invalidatePostCategoryCaches();
      purgePostArchive();
    },
  });
}

export async function updatePostCategoryOrder(
  items: { id: string; order: number }[],
): Promise<ActionResult<void>> {
  const parsed = postCategoryOrderSchema.safeParse(items);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "update",
    execute: async () => updatePostCategoryOrderCommand(parsed.data),
    success: () => createSuccess("順序を更新しました"),
    afterSuccess: () => {
      invalidatePostCategoryCaches();
      purgePostArchive();
    },
  });
}

export async function createPostTag(
  input: PostTagInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = postTagSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "create",
    execute: async () => createPostTagCommand(parsed.data),
    success: (result) => createSuccess("タグを作成しました", result),
    afterSuccess: () => {
      invalidatePostTagCaches();
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePostTag(
  id: string,
  input: PostTagInput,
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = postTagSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => updatePostTagCommand(validatedId.data, parsed.data),
    success: () => createSuccess("タグを更新しました"),
    afterSuccess: () => {
      invalidatePostTagCaches();
      purgePostArchive();
    },
  });
}

export async function deletePostTag(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "post",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deletePostTagCommand(validated.data),
    success: () => createSuccess("タグを削除しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POST_TAGS);
    },
  });
}
