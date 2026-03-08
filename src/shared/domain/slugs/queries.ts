import "server-only";

import { prisma } from "@/shared/db/prisma";

export type SlugContentType = "post" | "news" | "page" | "space";

export type SlugConflict = {
  contentType: SlugContentType;
  id: string;
};

export async function findSlugConflict(
  slug: string,
  currentType: SlugContentType,
  currentId?: string,
): Promise<SlugConflict | null> {
  const normalizedSlug = slug.toLowerCase();

  const [post, news, page, space] = await Promise.all([
    currentType === "post" && currentId
      ? prisma.post.findFirst({
          where: { slug: normalizedSlug, id: { not: currentId } },
          select: { id: true },
        })
      : prisma.post.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true },
        }),
    currentType === "news" && currentId
      ? prisma.news.findFirst({
          where: { slug: normalizedSlug, id: { not: currentId } },
          select: { id: true },
        })
      : prisma.news.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true },
        }),
    currentType === "page" && currentId
      ? prisma.page.findFirst({
          where: { slug: normalizedSlug, id: { not: currentId } },
          select: { id: true },
        })
      : prisma.page.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true },
        }),
    currentType === "space" && currentId
      ? prisma.space.findFirst({
          where: { slug: normalizedSlug, id: { not: currentId } },
          select: { id: true },
        })
      : prisma.space.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true },
        }),
  ]);

  if (post) {
    return { contentType: "post", id: post.id };
  }
  if (news) {
    return { contentType: "news", id: news.id };
  }
  if (page) {
    return { contentType: "page", id: page.id };
  }
  if (space) {
    return { contentType: "space", id: space.id };
  }

  return null;
}
