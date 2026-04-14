"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createPostSchema,
  updatePostBodySchema,
  updatePostSettingsSchema,
  type CreatePostInput,
  type UpdatePostBodyInput,
  type UpdatePostSettingsInput,
} from "@/admin/lib/validations/post";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import * as postCommands from "@/shared/domain/posts/post-commands";
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
      const result = await postCommands.createPost(
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

/**
 * 投稿記事の本文（Lexical エディタの contentJson / 派生 contentHtml）のみを更新する。
 *
 * 設定（タイトル・スラッグ・分類等）は変更しない。設定の更新は `updatePostSettings` を使用。
 */
export async function updatePostBody(
  id: string,
  input: UpdatePostBodyInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updatePostBodySchema.safeParse(input);
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
      updatedPost = await postCommands.updatePostBody(validatedId.data, {
        contentJson: parsed.data.contentJson,
        contentHtml,
      });
      return null;
    },
    afterSuccess: async () => {
      if (!updatedPost) {
        return;
      }

      await invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(updatedPost.slug));
      await purgePostCaches(updatedPost.slug);
    },
  });
}

/**
 * 投稿記事の設定（メタデータ・分類・タグ・SEO/OGP・レイアウト）のみを更新する。
 *
 * 本文（contentJson / contentHtml）は変更しない。本文の更新は `updatePostBody` を使用。
 */
export async function updatePostSettings(
  id: string,
  input: UpdatePostSettingsInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updatePostSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let updatedPost: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedPost = await postCommands.updatePostSettings(
        validatedId.data,
        omitUndefined({
          title: parsed.data.title,
          slug: parsed.data.slug,
          excerpt: parsed.data.excerpt,
          thumbnailUrl: parsed.data.thumbnailUrl,
          ogpImageUrl: parsed.data.ogpImageUrl,
          categoryId: parsed.data.categoryId,
          tags: parsed.data.tags,
          metaDescription: parsed.data.metaDescription,
          metaKeywords: parsed.data.metaKeywords,
          ogpTitle: parsed.data.ogpTitle,
          ogpDescription: parsed.data.ogpDescription,
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
      const result = await postCommands.deletePost(validated.data);
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
      publishedPost = await postCommands.publishPost(validated.data, user.id);
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
      const result = await postCommands.unpublishPost(validated.data);
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
