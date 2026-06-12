import "server-only";

import { prisma } from "@/shared/db/prisma";
import { EventStatus, PostStatus } from "@generated/prisma/enums";

export type SitemapSpace = {
  slug: string;
  updatedAt: Date;
};

export type SitemapNews = {
  slug: string;
  updatedAt: Date;
};

export type SitemapPost = {
  slug: string;
  updatedAt: Date;
  publishedAt: Date | null;
  category: {
    slug: string;
  } | null;
};

export type SitemapPostCategory = {
  slug: string;
  updatedAt: Date;
};

export type SitemapPostTag = {
  slug: string;
  updatedAt: Date;
};

export type SitemapCustomPage = {
  slug: string;
  updatedAt: Date;
};

export type SitemapEvent = {
  slug: string;
  updatedAt: Date;
};

export type SitemapTerms = {
  slug: string;
  updatedAt: Date;
};

export async function getSitemapContentData(): Promise<{
  spaces: SitemapSpace[];
  news: SitemapNews[];
  posts: SitemapPost[];
  postCategories: SitemapPostCategory[];
  postTags: SitemapPostTag[];
  customPages: SitemapCustomPage[];
  events: SitemapEvent[];
  terms: SitemapTerms[];
}> {
  const [
    spaces,
    news,
    posts,
    postCategories,
    postTags,
    customPages,
    events,
    terms,
  ] = await Promise.all([
    prisma.space.findMany({
      where: { isPublished: true, isActive: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.news.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        category: {
          select: {
            slug: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.postCategory.findMany({
      where: { posts: { some: { status: PostStatus.PUBLISHED } } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.postTag.findMany({
      where: { posts: { some: { post: { status: PostStatus.PUBLISHED } } } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.page.findMany({
      where: {
        isPublished: true,
        isActive: true,
        isSystemPage: false,
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.event.findMany({
      where: {
        status: EventStatus.PUBLISHED,
        deletedAt: null,
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.termsDocument.findMany({
      where: { deletedAt: null, isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    spaces,
    news,
    posts,
    postCategories,
    postTags,
    customPages,
    events,
    terms,
  };
}
