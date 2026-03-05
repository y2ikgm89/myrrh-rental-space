"use server";

import { prisma } from "@/shared/lib/prisma";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createSuccess, createFailure } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { withPermission } from "@/admin/lib/server-action-helpers";
import type { NewsWhereInput } from "@/shared/types/prisma";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { purgeNewsCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

// Types and schemas from centralized validation file
import {
  createNewsSchema,
  updateNewsSchema,
  type NewsData,
  type NewsVersionData,
  type GetNewsListResult,
  type NewsFilters,
  type NewsPagination,
  type CreateNewsInput,
  type UpdateNewsInput,
} from "@/admin/lib/validations/news";

// Re-export types for consumers
export type {
  NewsData,
  NewsVersionData,
  GetNewsListResult,
  NewsFilters,
  NewsPagination,
  CreateNewsInput,
  UpdateNewsInput,
} from "@/admin/lib/validations/news";

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor("news");

// =============================================================================
// Actions
// =============================================================================

/**
 * お知らせ一覧を取得
 */
export async function getNewsList(
  filters: NewsFilters = {},
  pagination: NewsPagination = {},
): Promise<GetNewsListResult> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return { news: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  const { status, search } = filters;

  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;

  // Where条件を構築
  const where: NewsWhereInput = {};

  if (status === "PUBLISHED") {
    where.isPublished = true;
  } else if (status === "DRAFT") {
    where.isPublished = false;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { contentHtml: { contains: search, mode: "insensitive" } },
    ];
  }

  // 総件数とお知らせ一覧を並列取得（N+1解消）
  const [total, news] = await prisma.$transaction([
    prisma.news.count({ where }),
    prisma.news.findMany({
      where,
      select: {
        id: true,
        slug: true,
        title: true,
        contentHtml: true,
        contentJson: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        contentWidth: true,
        contentWidthCustom: true,
        metaDescription: true,
        metaKeywords: true,
        ogpTitle: true,
        ogpDescription: true,
        ogpImageUrl: true,
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    news: toPlainArray(news),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * お知らせ詳細を取得
 */
export async function getNewsById(id: string): Promise<NewsData | null> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return null;
  }

  const news = await prisma.news.findUnique({
    where: { id },
  });

  if (!news) return null;

  return toPlainObject(news);
}

/**
 * お知らせを作成
 */
export const createNews = withPermission<[CreateNewsInput], { id: string }>(
  "news",
  "create",
)(async (_user, data) => {
  const parsed = createNewsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const { slug, title, contentJson } = parsed.data;

  // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断）
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "news",
  });
  if (!slugCheck.available) {
    return createFailure(getSlugErrorMessage(slugCheck.reason));
  }

  // JSON → HTML 変換（空コンテンツの場合はスキップ）
  const contentHtml = contentJson
    ? await renderEditorStateToHtmlLazy(contentJson)
    : "";

  const news = await prisma.news.create({
    data: {
      slug,
      title,
      contentJson: contentJson ? JSON.parse(contentJson) : undefined,
      contentHtml,
      isPublished: false,
    },
  });

  updateTag(CACHE_TAGS.NEWS);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeNewsCache(news.id), {
    operation: "purgeNewsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("お知らせを作成しました", { id: news.id });
});

/**
 * お知らせを更新
 */
export const updateNews = withPermission<[string, UpdateNewsInput], void>(
  "news",
  "update",
)(async (_user, id, data) => {
  const parsed = updateNewsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const existingNews = await prisma.news.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existingNews) {
    return createFailure("お知らせが見つかりません");
  }

  const {
    slug,
    title,
    contentJson,
    contentWidth,
    contentWidthCustom,
    metaDescription,
    metaKeywords,
    ogpTitle,
    ogpDescription,
    ogpImageUrl,
  } = parsed.data;

  // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断、自分自身は除外）
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "news",
    currentId: id,
  });
  if (!slugCheck.available) {
    return createFailure(getSlugErrorMessage(slugCheck.reason));
  }

  // JSON → HTML 変換
  const contentHtml = await renderEditorStateToHtmlLazy(contentJson);

  await prisma.news.update({
    where: { id },
    data: {
      slug,
      title,
      contentJson: JSON.parse(contentJson),
      contentHtml,
      contentWidth: contentWidth ?? null,
      contentWidthCustom: contentWidthCustom ?? null,
      // SEO フィールド
      metaDescription: metaDescription ?? null,
      metaKeywords: metaKeywords ?? null,
      // OGP フィールド
      ogpTitle: ogpTitle ?? null,
      ogpDescription: ogpDescription ?? null,
      ogpImageUrl: ogpImageUrl ?? null,
    },
  });

  updateTag(CACHE_TAGS.NEWS);
  updateTag(getCacheTag.news.detail(id));

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeNewsCache(id), {
    operation: "purgeNewsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("お知らせを保存しました");
});

/**
 * お知らせを削除
 */
export const deleteNews = withPermission<[string], void>(
  "news",
  "delete",
)(async (_user, id) => {
  const news = await prisma.news.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!news) {
    return createFailure("お知らせが見つかりません");
  }

  await prisma.news.delete({
    where: { id },
  });

  updateTag(CACHE_TAGS.NEWS);

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeNewsCache(id), {
    operation: "purgeNewsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("お知らせを削除しました");
});

/**
 * お知らせを公開（バージョン自動作成）
 */
export const publishNews = withPermission<[string], void>(
  "news",
  "publish",
)(async (user, id) => {
  // お知らせデータと最新バージョン番号を並列取得
  const [news, latestVersion] = await Promise.all([
    prisma.news.findUnique({
      where: { id },
      select: {
        id: true,
        publishedAt: true,
        contentHtml: true,
        contentJson: true,
      },
    }),
    prisma.newsVersion.findFirst({
      where: { newsId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  if (!news) {
    return createFailure("お知らせが見つかりません");
  }

  const nextVersion = (latestVersion?.version ?? 0) + 1;

  // トランザクションで公開 + バージョン作成
  await prisma.$transaction([
    prisma.news.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: news.publishedAt ?? new Date(),
      },
    }),
    prisma.newsVersion.create({
      data: {
        newsId: id,
        version: nextVersion,
        contentHtml: news.contentHtml,
        contentJson: news.contentJson ?? undefined,
        createdBy: user.id,
      },
    }),
  ]);

  updateTag(CACHE_TAGS.NEWS);
  updateTag(getCacheTag.news.detail(id));

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeNewsCache(id), {
    operation: "purgeNewsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess(`公開しました（バージョン ${nextVersion}）`);
});

/**
 * お知らせを非公開（下書きに戻す）
 */
export const unpublishNews = withPermission<[string], void>(
  "news",
  "publish",
)(async (_user, id) => {
  const news = await prisma.news.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!news) {
    return createFailure("お知らせが見つかりません");
  }

  await prisma.news.update({
    where: { id },
    data: {
      isPublished: false,
    },
  });

  updateTag(CACHE_TAGS.NEWS);
  updateTag(getCacheTag.news.detail(id));

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeNewsCache(id), {
    operation: "purgeNewsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess("下書きに戻しました");
});

/**
 * バックアップを作成（バージョン手動作成）
 */
export const createNewsBackup = withPermission<[string], { version: number }>(
  "news",
  "update",
)(async (user, id) => {
  // お知らせデータと最新バージョン番号を並列取得
  const [news, latestVersion] = await Promise.all([
    prisma.news.findUnique({
      where: { id },
      select: { id: true, contentHtml: true, contentJson: true },
    }),
    prisma.newsVersion.findFirst({
      where: { newsId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  if (!news) {
    return createFailure("お知らせが見つかりません");
  }

  const nextVersion = (latestVersion?.version ?? 0) + 1;

  await prisma.newsVersion.create({
    data: {
      newsId: id,
      version: nextVersion,
      contentHtml: news.contentHtml,
      contentJson: news.contentJson ?? undefined,
      createdBy: user.id,
    },
  });

  return createSuccess(
    `バックアップを作成しました（バージョン ${nextVersion}）`,
    { version: nextVersion },
  );
});

/**
 * バージョン履歴を取得
 */
export async function getNewsVersions(
  newsId: string,
): Promise<NewsVersionData[]> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return [];
  }

  const versions = await prisma.newsVersion.findMany({
    where: { newsId },
    select: {
      id: true,
      newsId: true,
      version: true,
      contentHtml: true,
      contentJson: true,
      createdAt: true,
      createdBy: true,
    },
    orderBy: { version: "desc" },
  });

  return toPlainArray(versions);
}

/**
 * バージョンを復元
 */
export const restoreNewsVersion = withPermission<[string, number], void>(
  "news",
  "update",
)(async (_user, newsId, version) => {
  const versionData = await prisma.newsVersion.findUnique({
    where: {
      newsId_version: { newsId, version },
    },
    select: { contentHtml: true, contentJson: true },
  });

  if (!versionData) {
    return createFailure("バージョンが見つかりません");
  }

  await prisma.news.update({
    where: { id: newsId },
    data: {
      contentHtml: versionData.contentHtml,
      contentJson: versionData.contentJson ?? undefined,
      isPublished: false,
    },
  });

  updateTag(CACHE_TAGS.NEWS);
  updateTag(getCacheTag.news.detail(newsId));

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgeNewsCache(newsId), {
    operation: "purgeNewsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess(`バージョン ${version} を復元しました（下書き状態）`);
});

// =============================================================================
// Public Functions (認証不要)
// =============================================================================

export type PublicNews = {
  id: string;
  slug: string;
  title: string;
  publishedAt: Date;
};

export type GetPublishedNewsListOptions = {
  take?: number;
};

/**
 * 公開済みお知らせ一覧を取得（認証不要）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedNewsList(
  options: GetPublishedNewsListOptions = {},
): Promise<PublicNews[]> {
  const { take = 5 } = options;

  const newsItems = await prisma.news.findMany({
    where: {
      isPublished: true,
      publishedAt: { not: null },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      publishedAt: true,
    },
    orderBy: {
      publishedAt: "desc",
    },
    take,
  });

  return toPlainArray(
    newsItems
      .filter((item) => item.publishedAt && item.publishedAt <= new Date())
      .map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        publishedAt: item.publishedAt!,
      })),
  );
}
