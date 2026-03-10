import "server-only";

import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import type {
  CreateNewsBackupResult,
  CreateNewsCommandInput,
  CreateNewsResult,
  DeleteNewsResult,
  PublishNewsResult,
  RestoreNewsVersionResult,
  UpdateNewsCommandInput,
  UpdateNewsResult,
} from "@/shared/domain/news/types";

function parseContentJson(contentJson: string) {
  if (!contentJson) {
    return undefined;
  }

  return parsePrismaInputJson(contentJson, "本文データが不正です");
}

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return value;
}

async function ensureNewsExists(
  id: string,
): Promise<{ id: string; slug: string }> {
  const news = await prisma.news.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });

  if (!news) {
    throw new DomainError("お知らせが見つかりません", "NOT_FOUND");
  }

  return news;
}

async function ensureNewsSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "news",
    currentId,
  });

  if (!slugCheck.available) {
    throw new DomainError(getSlugErrorMessage(slugCheck.reason), "CONFLICT");
  }
}

function buildNewsData(input: CreateNewsCommandInput | UpdateNewsCommandInput) {
  return {
    slug: input.slug,
    title: input.title,
    contentHtml: input.contentHtml,
    contentJson: parseContentJson(input.contentJson),
  };
}

export async function createNews(
  input: CreateNewsCommandInput,
): Promise<CreateNewsResult> {
  await ensureNewsSlugAvailable(input.slug);

  const news = await prisma.news.create({
    data: omitUndefined({
      ...buildNewsData(input),
      isPublished: false,
    }),
    select: {
      id: true,
      slug: true,
    },
  });

  return news;
}

export async function updateNews(
  id: string,
  input: UpdateNewsCommandInput,
): Promise<UpdateNewsResult> {
  const existingNews = await ensureNewsExists(id);
  await ensureNewsSlugAvailable(input.slug, id);

  await prisma.news.update({
    where: { id },
    data: omitUndefined({
      ...buildNewsData(input),
      contentWidth: input.contentWidth,
      contentWidthCustom: input.contentWidthCustom,
      metaDescription: normalizeNullableString(input.metaDescription),
      metaKeywords: normalizeNullableString(input.metaKeywords),
      ogpTitle: normalizeNullableString(input.ogpTitle),
      ogpDescription: normalizeNullableString(input.ogpDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    }),
  });

  return {
    oldSlug: existingNews.slug,
    slug: input.slug,
  };
}

export async function deleteNews(id: string): Promise<DeleteNewsResult> {
  const news = await ensureNewsExists(id);

  await prisma.news.delete({
    where: { id },
  });

  return {
    slug: news.slug,
  };
}

export async function publishNews(
  id: string,
  userId: string,
): Promise<PublishNewsResult> {
  const [news, latestVersion] = await Promise.all([
    prisma.news.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
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
    throw new DomainError("お知らせが見つかりません", "NOT_FOUND");
  }

  const version = (latestVersion?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.news.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: news.publishedAt ?? new Date(),
      },
    }),
    prisma.newsVersion.create({
      data: omitUndefined({
        newsId: id,
        version,
        contentHtml: news.contentHtml,
        contentJson: news.contentJson ?? undefined,
        createdBy: userId,
      }),
    }),
  ]);

  return {
    slug: news.slug,
    version,
  };
}

export async function unpublishNews(id: string): Promise<DeleteNewsResult> {
  const news = await ensureNewsExists(id);

  await prisma.news.update({
    where: { id },
    data: {
      isPublished: false,
    },
  });

  return {
    slug: news.slug,
  };
}

export async function createNewsBackup(
  id: string,
  userId: string,
): Promise<CreateNewsBackupResult> {
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
    throw new DomainError("お知らせが見つかりません", "NOT_FOUND");
  }

  const version = (latestVersion?.version ?? 0) + 1;

  await prisma.newsVersion.create({
    data: omitUndefined({
      newsId: id,
      version,
      contentHtml: news.contentHtml,
      contentJson: news.contentJson ?? undefined,
      createdBy: userId,
    }),
  });

  return { version };
}

export async function restoreNewsVersion(
  newsId: string,
  version: number,
): Promise<RestoreNewsVersionResult> {
  const [versionData, news] = await Promise.all([
    prisma.newsVersion.findUnique({
      where: {
        newsId_version: { newsId, version },
      },
      select: { contentHtml: true, contentJson: true },
    }),
    prisma.news.findUnique({
      where: { id: newsId },
      select: { slug: true },
    }),
  ]);

  if (!versionData) {
    throw new DomainError("バージョンが見つかりません", "NOT_FOUND");
  }

  if (!news) {
    throw new DomainError("お知らせが見つかりません", "NOT_FOUND");
  }

  await prisma.news.update({
    where: { id: newsId },
    data: omitUndefined({
      contentHtml: versionData.contentHtml,
      contentJson: versionData.contentJson ?? undefined,
      isPublished: false,
    }),
  });

  return {
    slug: news.slug,
  };
}
