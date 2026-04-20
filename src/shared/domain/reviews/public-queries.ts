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
 * サイト全体のレビュー機能 global gate
 *
 * multi-tenant SaaS pattern: Settings.reviewsEnabledGlobal が false の場合
 * 全スペースでレビュー非表示（per-space `Space.reviewsEnabled` に関わらず）。
 * 3 つの review query すべてが invocation 開始時にこの関数で gate 判定する。
 */
async function isReviewsEnabledGlobally(): Promise<boolean> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: { reviewsEnabledGlobal: true },
  });
  return settings?.reviewsEnabledGlobal ?? true;
}

/**
 * 公開済みレビュー一覧（スペース詳細ページ用）
 *
 * 顧客名はイニシャル表示（例: 山田 → 山○）
 */
export async function getPublishedReviewsForSpace(spaceId: string, limit = 5) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.REVIEWS, getCacheTag.reviews.space(spaceId));

  if (!(await isReviewsEnabledGlobally())) return [];

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
          replyBody: true,
          repliedAt: true,
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
      replyBody: r.replyBody,
      repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
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

  if (!(await isReviewsEnabledGlobally())) {
    return toPlainObject({ averageRating: 0, totalCount: 0 });
  }

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

  if (spaceIds.length === 0 || !(await isReviewsEnabledGlobally())) {
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
  const review = await prisma.spaceReview.findFirst({
    where: { reservationId, customerId },
    select: {
      id: true,
      rating: true,
      title: true,
      comment: true,
      replyBody: true,
      repliedAt: true,
      createdAt: true,
    },
  });

  if (!review) return null;

  return {
    ...review,
    createdAt: review.createdAt.toISOString(),
    repliedAt: review.repliedAt ? review.repliedAt.toISOString() : null,
  };
}
