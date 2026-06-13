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
  CreateNewsCommandInput,
  CreateNewsResult,
  DeleteNewsResult,
  PublishNewsResult,
  UpdateNewsBodyCommandInput,
  UpdateNewsSettingsCommandInput,
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

export async function createNews(
  input: CreateNewsCommandInput,
): Promise<CreateNewsResult> {
  await ensureNewsSlugAvailable(input.slug);

  const news = await prisma.news.create({
    data: omitUndefined({
      slug: input.slug,
      title: input.title,
      contentHtml: input.contentHtml,
      contentJson: parseContentJson(input.contentJson),
      isPublished: false,
    }),
    select: {
      id: true,
      slug: true,
    },
  });

  return news;
}

/**
 * お知らせの本文（contentJson / contentHtml）のみを更新する。
 */
export async function updateNewsBody(
  id: string,
  input: UpdateNewsBodyCommandInput,
): Promise<UpdateNewsResult> {
  const existingNews = await ensureNewsExists(id);

  await prisma.news.update({
    where: { id },
    data: omitUndefined({
      contentHtml: input.contentHtml,
      contentJson: parseContentJson(input.contentJson),
    }),
  });

  return {
    oldSlug: existingNews.slug,
    slug: existingNews.slug,
  };
}

/**
 * お知らせの設定（メタデータ・公開状態・レイアウト・SEO/OGP）のみを更新する。
 */
export async function updateNewsSettings(
  id: string,
  input: UpdateNewsSettingsCommandInput,
): Promise<UpdateNewsResult> {
  const existingNews = await ensureNewsExists(id);
  await ensureNewsSlugAvailable(input.slug, id);

  await prisma.news.update({
    where: { id },
    data: {
      slug: input.slug,
      title: input.title,
      contentWidth: input.contentWidth,
      contentWidthCustom: input.contentWidthCustom,
      metaDescription: normalizeNullableString(input.metaDescription),
      metaKeywords: normalizeNullableString(input.metaKeywords),
      ogpTitle: normalizeNullableString(input.ogpTitle),
      ogpDescription: normalizeNullableString(input.ogpDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
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

export async function publishNews(id: string): Promise<PublishNewsResult> {
  const news = await prisma.news.findUnique({
    where: { id },
    select: { id: true, slug: true, publishedAt: true },
  });

  if (!news) {
    throw new DomainError("お知らせが見つかりません", "NOT_FOUND");
  }

  await prisma.news.update({
    where: { id },
    data: {
      isPublished: true,
      publishedAt: news.publishedAt ?? new Date(),
    },
  });

  return {
    slug: news.slug,
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
