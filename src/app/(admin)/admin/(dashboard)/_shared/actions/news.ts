"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createNews as createNewsCommand,
  createNewsBackup as createNewsBackupCommand,
  deleteNews as deleteNewsCommand,
  publishNews as publishNewsCommand,
  restoreNewsVersion as restoreNewsVersionCommand,
  unpublishNews as unpublishNewsCommand,
  updateNews as updateNewsCommand,
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
  updateNewsSchema,
  type CreateNewsInput,
  type UpdateNewsInput,
} from "@/admin/lib/validations/news";

export type {
  CreateNewsInput,
  UpdateNewsInput,
} from "@/admin/lib/validations/news";
export type {
  GetNewsListResult,
  NewsData,
  NewsFilters,
  NewsPagination,
  NewsVersionData,
} from "@/shared/domain/news/types";

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
}

export async function createNews(
  input: CreateNewsInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createNewsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    parsed.data.contentJson,
  );
  let createdNewsSlug: string | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "create",
    execute: async () => {
      const result = await createNewsCommand({
        ...parsed.data,
        contentHtml,
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

export async function updateNews(
  id: string,
  input: UpdateNewsInput,
): Promise<MutationResult> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationMutationError(validatedId.error);
  }

  const parsed = updateNewsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(
    parsed.data.contentJson,
  );
  let updatedNews: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutationResult({
    resource: "news",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedNews = await updateNewsCommand(
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
