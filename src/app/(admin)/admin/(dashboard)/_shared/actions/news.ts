"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  createNews as createNewsCommand,
  createNewsBackup as createNewsBackupCommand,
  deleteNews as deleteNewsCommand,
  publishNews as publishNewsCommand,
  restoreNewsVersion as restoreNewsVersionCommand,
  unpublishNews as unpublishNewsCommand,
  updateNews as updateNewsCommand,
} from "@/shared/domain/news/commands";
import { createValidationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeNewsCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  createNewsSchema,
  updateNewsSchema,
  type CreateNewsInput,
  type UpdateNewsInput,
} from "@/admin/lib/validations/news";

export type { CreateNewsInput, UpdateNewsInput } from "@/admin/lib/validations/news";
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
): Promise<ActionResult<{ id: string }>> {
  const parsed = createNewsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : "";
  let createdNewsSlug: string | null = null;

  return executeAdminMutation({
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
    success: (result) => createSuccess("お知らせを作成しました", result),
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
): Promise<ActionResult<void>> {
  const validatedId = idSchema.safeParse(id);
  if (!validatedId.success) {
    return createValidationError(validatedId.error);
  }

  const parsed = updateNewsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const contentHtml = await renderEditorStateToHtmlLazy(parsed.data.contentJson);
  let updatedNews: { oldSlug: string; slug: string } | null = null;

  return executeAdminMutation({
    resource: "news",
    action: "update",
    resourceId: validatedId.data,
    execute: async () => {
      updatedNews = await updateNewsCommand(validatedId.data, {
        ...parsed.data,
        contentHtml,
        contentWidth: parsed.data.contentWidth ?? null,
        contentWidthCustom: parsed.data.contentWidthCustom ?? null,
      });
    },
    success: () => createSuccess("お知らせを保存しました"),
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

export async function deleteNews(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  let deletedNewsSlug: string | null = null;

  return executeAdminMutation({
    resource: "news",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      const result = await deleteNewsCommand(validated.data);
      deletedNewsSlug = result.slug;
    },
    success: () => createSuccess("お知らせを削除しました"),
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

export async function publishNews(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  let publishedNews: { slug: string; version: number } | null = null;

  return executeAdminMutation({
    resource: "news",
    action: "publish",
    resourceId: validated.data,
    execute: async (user) => {
      publishedNews = await publishNewsCommand(validated.data, user.id);
    },
    success: () =>
      createSuccess(
        `公開しました（バージョン ${publishedNews?.version ?? 0}）`,
      ),
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

export async function unpublishNews(id: string): Promise<ActionResult<void>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  let unpublishedNewsSlug: string | null = null;

  return executeAdminMutation({
    resource: "news",
    action: "publish",
    resourceId: validated.data,
    execute: async () => {
      const result = await unpublishNewsCommand(validated.data);
      unpublishedNewsSlug = result.slug;
    },
    success: () => createSuccess("下書きに戻しました"),
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
): Promise<ActionResult<{ version: number }>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  return executeAdminMutation({
    resource: "news",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => createNewsBackupCommand(validated.data, user.id),
    success: (result) =>
      createSuccess(
        `バックアップを作成しました（バージョン ${result.version}）`,
        { version: result.version },
      ),
  });
}

export async function restoreNewsVersion(
  newsId: string,
  version: number,
): Promise<ActionResult<void>> {
  const parsed = versionSchema.safeParse({ newsId, version });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  let restoredNewsSlug: string | null = null;

  return executeAdminMutation({
    resource: "news",
    action: "update",
    resourceId: parsed.data.newsId,
    execute: async () => {
      const result = await restoreNewsVersionCommand(
        parsed.data.newsId,
        parsed.data.version,
      );
      restoredNewsSlug = result.slug;
    },
    success: () =>
      createSuccess(
        `バージョン ${parsed.data.version} を復元しました（下書き状態）`,
      ),
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
