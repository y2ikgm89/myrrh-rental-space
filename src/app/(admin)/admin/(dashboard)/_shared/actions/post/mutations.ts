"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createPostSchema,
  updatePostBodySchema,
  updatePostSettingsSchema,
  type CreatePostInput,
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
import { deriveLexicalContentHtmlFromJson } from "@/admin/components/editor/lexical/preview/derive-content-html.server";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";

const idSchema = uuidIdSchema("記事");

function parsePublishedAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = parseDateTimeLocalAsJst(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 投稿記事 新規作成。 */
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
          contentHtml: deriveLexicalContentHtmlFromJson(
            parsed.data.contentJson,
          ),
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

/** 投稿記事 設定更新。 */
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
          status: parsed.data.status,
          publishedAt: parsePublishedAt(parsed.data.publishedAt),
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

/** 投稿記事 本文更新。 */
export async function updatePostBody(
  id: string,
  input: { contentJson: string },
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
        contentHtml: deriveLexicalContentHtmlFromJson(parsed.data.contentJson),
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

export async function publishPost(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let publishedPost: { slug: string } | null = null;

  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      publishedPost = await postCommands.publishPost(validated.data);
      return null;
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
