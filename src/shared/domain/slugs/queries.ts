import "server-only";

import { prisma } from "@/shared/db/prisma";

export type SlugContentType = "post" | "news" | "page" | "space";

export type SlugConflict = {
  contentType: SlugContentType;
  id: string;
  /**
   * 衝突相手がゴミ箱（論理削除済み）の行か。
   *
   * ゴミ箱の行は一覧に出ないので、素の「既に使用されています」だけでは利用者が
   * **何とぶつかっているのか画面から辿れない**。メッセージを出し分けるために持つ。
   * Post / Space は削除済み行をそもそも衝突とみなさないので常に false。
   */
  trashed: boolean;
};

export async function findSlugConflict(
  slug: string,
  currentType: SlugContentType,
  currentId?: string,
): Promise<SlugConflict | null> {
  const normalizedSlug = slug.toLowerCase();

  const [post, news, page, space] = await Promise.all([
    // Post.slug は partial unique (deletedAt IS NULL) のため findUnique 不可。
    // ゴミ箱中の slug は衝突とみなさない。
    prisma.post.findFirst({
      where: {
        slug: normalizedSlug,
        deletedAt: null,
        ...(currentType === "post" && currentId
          ? { id: { not: currentId } }
          : {}),
      },
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
    // Page はゴミ箱（isActive: false）の行も slug を保持し続けるため、衝突相手に
    // なりうる。どちらなのかを `isActive` で持ち帰ってメッセージを出し分ける。
    currentType === "page" && currentId
      ? prisma.page.findFirst({
          where: { slug: normalizedSlug, id: { not: currentId } },
          select: { id: true, isActive: true },
        })
      : prisma.page.findUnique({
          where: { slug: normalizedSlug },
          select: { id: true, isActive: true },
        }),
    // Space.slug は partial unique (isActive = true) のため findUnique 不可。
    // soft-delete 済みの slug は衝突とみなさない。
    prisma.space.findFirst({
      where: {
        slug: normalizedSlug,
        isActive: true,
        ...(currentType === "space" && currentId
          ? { id: { not: currentId } }
          : {}),
      },
      select: { id: true },
    }),
  ]);

  if (post) {
    return { contentType: "post", id: post.id, trashed: false };
  }
  if (news) {
    return { contentType: "news", id: news.id, trashed: false };
  }
  if (page) {
    return { contentType: "page", id: page.id, trashed: !page.isActive };
  }
  if (space) {
    return { contentType: "space", id: space.id, trashed: false };
  }

  return null;
}
