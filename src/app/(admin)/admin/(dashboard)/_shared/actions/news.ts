"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createNews as createNewsCommand,
  createNewsBackup as createNewsBackupCommand,
  deleteNews as deleteNewsCommand,
  publishNews as publishNewsCommand,
  restoreNewsVersion as restoreNewsVersionCommand,
  unpublishNews as unpublishNewsCommand,
  updateNewsBody as updateNewsBodyCommand,
  updateNewsSettings as updateNewsSettingsCommand,
} from "@/shared/domain/news/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeNewsCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
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

const idSchema = z.string().uuid({ error: "お知らせIDが不正です" });
const versionSchema = z.object({
  newsId: z.string().uuid({ error: "お知らせIDが不正です" }),
  version: z.number().int().positive({ error: "バージョンが不正です" }),
});

function purgeNewsCaches(...slugs: Array<string | undefined>): void {
  const uniqueSlugs = [
    ...new Set(slugs.filter((slug): slug is string => Boolean(slug))),
  ];

  for (const slug of uniqueSlugs) {
    fireAndForget(purgeNewsCache(slug), {
      operation: "purgeNewsCache",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
    });
  }
}

function invalidateNewsCollectionCaches(): void {
  updateTag(CACHE_TAGS.NEWS);
  updateTag(CACHE_TAGS.SIDEBAR_DATA);
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

export async function publishNews(
  id: string,
): Promise<MutationResult<{ version: number }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let publishedNews: { slug: string; version: number } | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "publish",
    resourceId: validated.data,
    execute: async (user) => {
      publishedNews = await publishNewsCommand(validated.data, user.id);
      return { version: publishedNews.version };
    },
    afterSuccess: () => {
      if (!publishedNews) {
        return;
      }

      invalidateNewsCollectionCaches();
      updateTag(getCacheTag.news.detail(publishedNews.slug));
      purgeNewsCaches(publishedNews.slug);
    },
  });
}

export async function unpublishNews(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let unpublishedNewsSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      const result = await unpublishNewsCommand(validated.data);
      unpublishedNewsSlug = result.slug;
      return null;
    },
    afterSuccess: () => {
      if (!unpublishedNewsSlug) {
        return;
      }

      invalidateNewsCollectionCaches();
      updateTag(getCacheTag.news.detail(unpublishedNewsSlug));
      purgeNewsCaches(unpublishedNewsSlug);
    },
  });
}

export async function createNewsBackup(
  id: string,
): Promise<MutationResult<{ version: number }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "news",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => createNewsBackupCommand(validated.data, user.id),
  });
}

export async function restoreNewsVersion(
  newsId: string,
  version: number,
): Promise<MutationResult<{ version: number }>> {
  const parsed = versionSchema.safeParse({ newsId, version });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let restoredNewsSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "update",
    resourceId: parsed.data.newsId,
    execute: async () => {
      const result = await restoreNewsVersionCommand(
        parsed.data.newsId,
        parsed.data.version,
      );
      restoredNewsSlug = result.slug;
      return { version: parsed.data.version };
    },
    afterSuccess: () => {
      if (!restoredNewsSlug) {
        return;
      }

      invalidateNewsCollectionCaches();
      updateTag(getCacheTag.news.detail(restoredNewsSlug));
      purgeNewsCaches(restoredNewsSlug);
    },
  });
}
