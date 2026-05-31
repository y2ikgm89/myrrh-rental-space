import "server-only";

import { prisma } from "@/shared/db/prisma";
import { EventStatus, PostStatus } from "@generated/prisma/enums";
import { toPlainArray } from "@/shared/lib/serialize";
import { parseStringArray } from "@/shared/lib/json-validators";
import type { LinkCardContentType } from "@/shared/domain/link-cards/content-types";

/**
 * 内部リンクカードの候補検索結果（管理画面ピッカー用、軽量）。
 */
export type LinkCardSearchItem = {
  contentType: LinkCardContentType;
  contentId: string;
  title: string;
  thumbnailUrl: string | null;
};

const SEARCH_LIMIT_DEFAULT = 10;
const SEARCH_LIMIT_MAX = 30;

/**
 * サイト内コンテンツ（記事 / お知らせ / スペース / イベント）から、
 * 公開済みのものを種別 + タイトル部分一致で検索する。
 *
 * 公開フィルタは各 public-queries と同条件:
 * - post:  status = PUBLISHED
 * - news:  isPublished = true
 * - space: isPublished = true かつ isActive = true（詳細ページの可視条件に合わせる）
 * - event: status = PUBLISHED
 */
export async function searchLinkCardCandidates(params: {
  contentType: LinkCardContentType;
  query: string;
  limit?: number;
}): Promise<LinkCardSearchItem[]> {
  const limit = Math.min(
    params.limit ?? SEARCH_LIMIT_DEFAULT,
    SEARCH_LIMIT_MAX,
  );
  const q = params.query.trim();
  const titleContains =
    q.length > 0 ? { contains: q, mode: "insensitive" as const } : undefined;

  switch (params.contentType) {
    case "post": {
      const rows = await prisma.post.findMany({
        where: {
          status: PostStatus.PUBLISHED,
          ...(titleContains && { title: titleContains }),
        },
        select: { id: true, title: true, thumbnailUrl: true },
        orderBy: { publishedAt: "desc" },
        take: limit,
      });
      return toPlainArray(
        rows.map((r) => ({
          contentType: "post" as const,
          contentId: r.id,
          title: r.title,
          thumbnailUrl: r.thumbnailUrl ?? null,
        })),
      );
    }

    case "news": {
      const rows = await prisma.news.findMany({
        where: {
          isPublished: true,
          ...(titleContains && { title: titleContains }),
        },
        select: { id: true, title: true },
        orderBy: { publishedAt: "desc" },
        take: limit,
      });
      return toPlainArray(
        rows.map((r) => ({
          contentType: "news" as const,
          contentId: r.id,
          title: r.title,
          thumbnailUrl: null,
        })),
      );
    }

    case "space": {
      const rows = await prisma.space.findMany({
        where: {
          isPublished: true,
          isActive: true,
          ...(titleContains && { name: titleContains }),
        },
        select: { id: true, name: true, mainImageUrl: true, imageUrls: true },
        orderBy: { name: "asc" },
        take: limit,
      });
      return toPlainArray(
        rows.map((r) => ({
          contentType: "space" as const,
          contentId: r.id,
          title: r.name,
          thumbnailUrl:
            r.mainImageUrl ?? parseStringArray(r.imageUrls)[0] ?? null,
        })),
      );
    }

    case "event": {
      const rows = await prisma.event.findMany({
        where: {
          status: EventStatus.PUBLISHED,
          ...(titleContains && { title: titleContains }),
        },
        select: { id: true, title: true, thumbnailUrl: true },
        orderBy: { startTime: "desc" },
        take: limit,
      });
      return toPlainArray(
        rows.map((r) => ({
          contentType: "event" as const,
          contentId: r.id,
          title: r.title,
          thumbnailUrl: r.thumbnailUrl ?? null,
        })),
      );
    }

    default:
      return [];
  }
}
