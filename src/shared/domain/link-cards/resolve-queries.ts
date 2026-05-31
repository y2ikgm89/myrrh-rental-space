import "server-only";

import { prisma } from "@/shared/db/prisma";
import { EventStatus, PostStatus } from "@generated/prisma/enums";
import { parseStringArray } from "@/shared/lib/json-validators";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";
import { getPermalinkSettings } from "@/shared/domain/settings/queries/display";
import type { LinkCardContentType } from "@/shared/domain/link-cards/content-types";

/**
 * 公開描画時に解決された内部リンクカードの表示データ。
 */
export type ResolvedLinkCard = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  excerpt: string | null;
  thumbnailUrl: string | null;
  href: string;
};

/**
 * 指定種別の id 群を公開フィルタ付きで一括解決し、`id → ResolvedLinkCard` の Map を返す。
 *
 * 参照先が削除 / 非公開なら Map に含まれない（呼び出し側でカードを描画しない＝404 防止）。
 * 常に最新データを返すため `'use cache'` は付けない（freshness 優先 + id 配列の cache key 肥大回避）。
 */
export async function resolveLinkCardsByType(
  contentType: LinkCardContentType,
  ids: readonly string[],
): Promise<Map<string, ResolvedLinkCard>> {
  if (ids.length === 0) return new Map();
  const uniqueIds = Array.from(new Set(ids));

  switch (contentType) {
    case "post":
      return resolvePostCards(uniqueIds);
    case "news":
      return resolveNewsCards(uniqueIds);
    case "space":
      return resolveSpaceCards(uniqueIds);
    case "event":
      return resolveEventCards(uniqueIds);
    default:
      return new Map();
  }
}

async function resolvePostCards(
  ids: string[],
): Promise<Map<string, ResolvedLinkCard>> {
  const [rows, permalinkSettings] = await Promise.all([
    prisma.post.findMany({
      where: { id: { in: ids }, status: PostStatus.PUBLISHED },
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        thumbnailUrl: true,
        publishedAt: true,
        category: { select: { slug: true } },
      },
    }),
    getPermalinkSettings(),
  ]);

  const map = new Map<string, ResolvedLinkCard>();
  for (const r of rows) {
    map.set(r.id, {
      contentType: "post",
      contentId: r.id,
      title: r.title,
      excerpt: r.excerpt ?? null,
      thumbnailUrl: r.thumbnailUrl ?? null,
      href: buildPostCanonicalPath(
        {
          slug: r.slug,
          publishedAt: r.publishedAt,
          category: r.category,
        },
        permalinkSettings ?? undefined,
      ),
    });
  }
  return map;
}

async function resolveNewsCards(
  ids: string[],
): Promise<Map<string, ResolvedLinkCard>> {
  const rows = await prisma.news.findMany({
    where: { id: { in: ids }, isPublished: true },
    select: { id: true, slug: true, title: true },
  });

  const map = new Map<string, ResolvedLinkCard>();
  for (const r of rows) {
    map.set(r.id, {
      contentType: "news",
      contentId: r.id,
      title: r.title,
      excerpt: null,
      thumbnailUrl: null,
      href: `/news/${r.slug}`,
    });
  }
  return map;
}

async function resolveSpaceCards(
  ids: string[],
): Promise<Map<string, ResolvedLinkCard>> {
  const rows = await prisma.space.findMany({
    where: { id: { in: ids }, isPublished: true, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      descriptionPlainText: true,
      mainImageUrl: true,
      imageUrls: true,
    },
  });

  const map = new Map<string, ResolvedLinkCard>();
  for (const r of rows) {
    map.set(r.id, {
      contentType: "space",
      contentId: r.id,
      title: r.name,
      excerpt:
        r.descriptionPlainText.length > 0 ? r.descriptionPlainText : null,
      thumbnailUrl: r.mainImageUrl ?? parseStringArray(r.imageUrls)[0] ?? null,
      href: `/spaces/${r.slug}`,
    });
  }
  return map;
}

async function resolveEventCards(
  ids: string[],
): Promise<Map<string, ResolvedLinkCard>> {
  const rows = await prisma.event.findMany({
    where: { id: { in: ids }, status: EventStatus.PUBLISHED },
    select: { id: true, slug: true, title: true, thumbnailUrl: true },
  });

  const map = new Map<string, ResolvedLinkCard>();
  for (const r of rows) {
    map.set(r.id, {
      contentType: "event",
      contentId: r.id,
      title: r.title,
      excerpt: null,
      thumbnailUrl: r.thumbnailUrl ?? null,
      href: `/events/${r.slug}`,
    });
  }
  return map;
}
