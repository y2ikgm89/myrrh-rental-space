import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

/**
 * 公開済みレビュー一覧（スペース詳細ページ用）
 *
 * 顧客名はイニシャル表示（例: 山田 → 山○）
 */
export async function getPublishedReviewsForSpace(spaceId: string, limit = 5) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.REVIEWS, getCacheTag.reviews.space(spaceId));

  const reviews = await safeFetch({
    fetch: () =>
      prisma.spaceReview.findMany({
        where: {
          spaceId,
          isPublished: true,
          space: { reviewsEnabled: true },
        },
        select: {
          id: true,
          rating: true,
          title: true,
          comment: true,
          createdAt: true,
          customer: { select: { lastName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedReviewsForSpace",
  });

  return toPlainArray(
    reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      customerInitial: r.customer.lastName
        ? `${r.customer.lastName.charAt(0)}○`
        : "匿名",
    })),
  );
}

/**
 * スペースのレビュー統計（平均評価・件数）
 */
export async function getSpaceReviewStats(spaceId: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.REVIEWS, getCacheTag.reviews.stats(spaceId));

  const result = await safeFetch({
    fetch: async () => {
      const aggregate = await prisma.spaceReview.aggregate({
        where: {
          spaceId,
          isPublished: true,
          space: { reviewsEnabled: true },
        },
        _avg: { rating: true },
        _count: { id: true },
      });

      return {
        averageRating: aggregate._avg.rating
          ? Number(aggregate._avg.rating)
          : 0,
        totalCount: aggregate._count.id,
      };
    },
    fallback: { averageRating: 0, totalCount: 0 },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSpaceReviewStats",
  });

  return toPlainObject(result);
}

/**
 * 複数スペースのレビュー統計を一括取得（スペース一覧カード用）
 *
 * Record<spaceId, stats> を返す（Map は JSON シリアライズ不可のため Record を使用）
 */
export async function getSpaceReviewStatsMultiple(spaceIds: string[]) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.REVIEWS);

  if (spaceIds.length === 0) {
    return toPlainObject(
      {} satisfies Record<
        string,
        { averageRating: number; totalCount: number }
      >,
    );
  }

  const result = await safeFetch({
    fetch: async () => {
      const reviews = await prisma.spaceReview.groupBy({
        by: ["spaceId"],
        where: {
          spaceId: { in: spaceIds },
          isPublished: true,
          space: { reviewsEnabled: true },
        },
        _avg: { rating: true },
        _count: { id: true },
      });

      const statsRecord: Record<
        string,
        { averageRating: number; totalCount: number }
      > = {};

      for (const r of reviews) {
        statsRecord[r.spaceId] = {
          averageRating: r._avg.rating ? Number(r._avg.rating) : 0,
          totalCount: r._count.id,
        };
      }

      return statsRecord;
    },
    fallback: {} satisfies Record<
      string,
      { averageRating: number; totalCount: number }
    >,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSpaceReviewStatsMultiple",
  });

  return toPlainObject(result);
}

/**
 * 予約に対するレビューを取得（マイページ用）
 *
 * 顧客の予約詳細ページで既存レビューの表示判定に使用
 */
export async function getReviewForReservation(
  reservationId: string,
  customerId: string,
) {
  return prisma.spaceReview.findFirst({
    where: { reservationId, customerId },
    select: {
      id: true,
      rating: true,
      title: true,
      comment: true,
      createdAt: true,
    },
  });
}
