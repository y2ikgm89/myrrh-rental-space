"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createPostSchema,
  postBodyFormSchema,
  postSettingsFormSchema,
  updatePostBodySchema,
  updatePostSettingsSchema,
  type CreatePostInput,
  type UpdatePostSettingsInput,
} from "@/admin/lib/validations/post";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import * as postCommands from "@/shared/domain/posts/post-commands";
import { getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { isMutationError } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  invalidatePostCollectionCaches,
  purgePostCaches,
} from "./cache-helpers";

const idSchema = z.uuid({ error: "投稿IDが不正です" });

/**
 * 投稿記事 新規作成（既存 RHF callback 用、互換維持）。
 * Sub-Chunk 2d で usePostEditor が conform 化されるまで残置。
 */
export async function createPost(
  input: CreatePostInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createPostSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let createdPostSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "create",
    execute: async (user) => {
      const result = await postCommands.createPost(
        omitUndefined({
          ...parsed.data,
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
 * 投稿記事の本文（Lexical エディタの contentJson / 派生 contentHtml）のみを更新する
 * conform 用 Server Action。`(prev, formData) => SubmissionResult` signature で
 * `useActionState` から呼び出す。id 必要のため呼び出し側で `bind(null, post.id)` 部分適用。
 */
export async function updatePostBodyAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, postBodyFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "post",
      action: "update",
      resourceId: id,
      execute: async () => {
        const updated = await postCommands.updatePostBody(id, {
          contentJson: data.contentJson,
          contentHtml: data.contentHtml,
        });
        return updated;
      },
      afterSuccess: async (updated) => {
        await invalidatePostCollectionCaches();
        updateTag(getCacheTag.posts.detail(updated.slug));
        await purgePostCaches(updated.slug);
      },
    });
    return isMutationError(result)
      ? { ok: false, error: result.error }
      : { ok: true };
  });
}

/**
 * 投稿記事の設定（メタデータ・分類・タグ・SEO/OGP・レイアウト）のみを更新する
 * conform 用 Server Action。
 */
export async function updatePostSettingsAction(
  id: string,
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    postSettingsFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "post",
        action: "update",
        resourceId: id,
        execute: async () => {
          const updated = await postCommands.updatePostSettings(
            id,
            omitUndefined({
              title: data.title,
              slug: data.slug,
              excerpt: data.excerpt,
              thumbnailUrl: data.thumbnailUrl,
              ogpImageUrl: data.ogpImageUrl,
              categoryId: data.categoryId,
              tags: data.tags,
              metaDescription: data.metaDescription,
              metaKeywords: data.metaKeywords,
              ogpTitle: data.ogpTitle,
              ogpDescription: data.ogpDescription,
              contentWidth: data.contentWidth ?? null,
              contentWidthCustom: data.contentWidthCustom ?? null,
            }),
          );
          return updated;
        },
        afterSuccess: async (updated) => {
          await invalidatePostCollectionCaches();
          updateTag(getCacheTag.posts.detail(updated.oldSlug));
          if (updated.slug !== updated.oldSlug) {
            updateTag(getCacheTag.posts.detail(updated.slug));
          }
          await purgePostCaches(updated.oldSlug, updated.slug);
        },
      });
      return isMutationError(result)
        ? { ok: false, error: result.error }
        : { ok: true };
    },
  );
}

/**
 * 投稿記事 設定更新（既存 RHF callback 用、互換維持）。
 * usePostEditor が conform 化されるまで残置。
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

/**
 * 投稿記事 本文更新（既存 RHF callback 用、互換維持）。
 * Sub-Chunk 2d で usePostEditor が conform 化されるまで残置。
 */
export async function updatePostBody(
  id: string,
  input: { contentJson: string; contentHtml: string },
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updatePostBodySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let updatedPost: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedPost = await postCommands.updatePostBody(validatedId.data, {
        contentJson: parsed.data.contentJson,
        contentHtml: parsed.data.contentHtml,
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

export async function archivePost(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let archivedPostSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      const result = await postCommands.archivePost(validated.data);
      archivedPostSlug = result.slug;
      return null;
    },
    afterSuccess: async () => {
      if (!archivedPostSlug) {
        return;
      }

      await invalidatePostCollectionCaches();
      updateTag(getCacheTag.posts.detail(archivedPostSlug));
      await purgePostCaches(archivedPostSlug);
    },
  });
}
