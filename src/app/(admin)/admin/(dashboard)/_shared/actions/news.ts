"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createNews as createNewsCommand,
  deleteNews as deleteNewsCommand,
  publishNews as publishNewsCommand,
  unpublishNews as unpublishNewsCommand,
  updateNewsBody as updateNewsBodyCommand,
  updateNewsSettings as updateNewsSettingsCommand,
} from "@/shared/domain/news/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { purgeCloudflareDetailUrls } from "@/shared/lib/cloudflare";
import {
  invalidateSiteWideCache,
  purgeMarketingHomeTag,
  firePurgeAsync,
} from "@/shared/lib/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  createNewsSchema,
  updateNewsBodySchema,
  updateNewsSettingsSchema,
  type CreateNewsInput,
  type UpdateNewsBodyInput,
  type UpdateNewsSettingsInput,
} from "@/admin/lib/validations/news";

const idSchema = z.uuid({ error: "お知らせIDが不正です" });

function purgeNewsCaches(...slugs: Array<string | undefined>): void {
  const unique = [...new Set(slugs.filter((s): s is string => Boolean(s)))].map(
    (s) => `/news/${s}`,
  );
  if (unique.length === 0) return;
  void firePurgeAsync(() => purgeCloudflareDetailUrls(unique), {
    operation: "purgeNewsDetailUrls",
    urls: unique,
  });
}

function invalidateNewsCollectionCaches(): void {
  invalidateSiteWideCache([CACHE_TAGS.NEWS, CACHE_TAGS.SIDEBAR_DATA]);
  purgeMarketingHomeTag();
}

export async function createNews(
  input: CreateNewsInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createNewsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let createdNewsSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "create",
    execute: async () => {
      const result = await createNewsCommand({
        ...parsed.data,
      });
      createdNewsSlug = result.slug;
      return { id: result.id };
    },
    afterSuccess: () => {
      invalidateNewsCollectionCaches();
      purgeNewsCaches(createdNewsSlug ?? undefined);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

/**
 * お知らせの本文（contentJson / 派生 contentHtml）のみを更新する。
 */
export async function updateNewsBody(
  id: string,
  input: UpdateNewsBodyInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updateNewsBodySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let updatedNews: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedNews = await updateNewsBodyCommand(validatedId.data, {
        contentJson: parsed.data.contentJson,
        contentHtml: parsed.data.contentHtml,
      });
      return null;
    },
    afterSuccess: () => {
      if (!updatedNews) {
        return;
      }

      invalidateNewsCollectionCaches();
      updateTag(getCacheTag.news.detail(updatedNews.slug));
      purgeNewsCaches(updatedNews.slug);
    },
  });
}

/**
 * お知らせの設定（メタデータ・公開状態・SEO/OGP・レイアウト）のみを更新する。
 */
export async function updateNewsSettings(
  id: string,
  input: UpdateNewsSettingsInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updateNewsSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let updatedNews: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedNews = await updateNewsSettingsCommand(
        validatedId.data,
        omitUndefined({
          slug: parsed.data.slug,
          title: parsed.data.title,
          contentWidth: parsed.data.contentWidth ?? null,
          contentWidthCustom: parsed.data.contentWidthCustom ?? null,
          metaDescription: parsed.data.metaDescription,
          metaKeywords: parsed.data.metaKeywords,
          ogpTitle: parsed.data.ogpTitle,
          ogpDescription: parsed.data.ogpDescription,
          ogpImageUrl: parsed.data.ogpImageUrl,
        }),
      );
      return null;
    },
    afterSuccess: () => {
      if (!updatedNews) {
        return;
      }

      invalidateNewsCollectionCaches();
      updateTag(getCacheTag.news.detail(updatedNews.oldSlug));
      if (updatedNews.slug !== updatedNews.oldSlug) {
        updateTag(getCacheTag.news.detail(updatedNews.slug));
      }
      purgeNewsCaches(updatedNews.oldSlug, updatedNews.slug);
    },
  });
}

export async function deleteNews(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let deletedNewsSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      const result = await deleteNewsCommand(validated.data);
      deletedNewsSlug = result.slug;
      return null;
    },
    afterSuccess: () => {
      if (!deletedNewsSlug) {
        return;
      }

      invalidateNewsCollectionCaches();
      updateTag(getCacheTag.news.detail(deletedNewsSlug));
      purgeNewsCaches(deletedNewsSlug);
    },
  });
}

export async function updateNewsPublished(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<{ isPublished: boolean }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let affectedSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      if (isPublished) {
        const result = await publishNewsCommand(validated.data);
        affectedSlug = result.slug;
      } else {
        const result = await unpublishNewsCommand(validated.data);
        affectedSlug = result.slug;
      }
      return { isPublished };
    },
    afterSuccess: () => {
      if (!affectedSlug) {
        return;
      }

      invalidateNewsCollectionCaches();
      updateTag(getCacheTag.news.detail(affectedSlug));
      purgeNewsCaches(affectedSlug);
    },
  });
}
