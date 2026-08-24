import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

/**
 * サイト全体のレビュー機能 global gate
 *
 * `SettingsFeatures.featureModules.reviews` SSoT を `isFeatureEnabled` 経由で解決する。
 * 依存解決（reviews requires spaces）も含むため、spaces OFF → reviews も自動 OFF。
 */
async function isReviewsEnabledGlobally(): Promise<boolean> {
  return isFeatureEnabled("reviews");
}

/**
 * 公開済みレビュー一覧（スペース詳細ページ用）
 *
 * 顧客名はイニシャル表示（例: 山田 → 山○）
 *
 * **退会（匿名化）済みの顧客は「匿名」にする。** 匿名化は氏名を placeholder
 * （`CUSTOMER_ANONYMIZE_PLACEHOLDER_LAST_NAME`）に置き換えるだけなので、頭文字を
 * 取ると placeholder の 1 文字目が**その人の姓であるかのように**表示される。
 * 判定は `anonymizedAt`（append-only の匿名化証跡）で行う。placeholder の綴りを
 * 突き合わせると、文言を変えた瞬間に黙って壊れる。
 *
 * 本文（`title` / `comment`）は退会後も残す。レビューはスペースについての情報で、
 * 読み手はそれを前提に判断している。退会で消せると「低評価を消すために退会する」
 * 経路になる。消えるのは書き手が誰かだけ。
 *
 * **feature module の判定はこの `'use cache'` の外に置く。** 中で呼ぶと、
 * `getFeatureModulesSettings`（kill switch なので `FEATURE_FLAGS` = minutes）の
 * 結果を `PUBLIC_CONTENT`（hours）のキャッシュが包んでしまい、reviews を OFF に
 * しても最大で hours のあいだレビューが出続ける。
 * 寿命の違うものを同じキャッシュに入れない（監査 F-65 と同じ形）。
 */
async function getPublishedReviewsForSpaceCached(
  spaceId: string,
  limit: number,
) {
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
          replyBody: true,
          repliedAt: true,
          createdAt: true,
          customer: { select: { lastName: true, anonymizedAt: true } },
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
      customerInitial:
        r.customer.anonymizedAt === null && r.customer.lastName
          ? `${r.customer.lastName.charAt(0)}○`
          : "匿名",
    })),
  );
}

export async function getPublishedReviewsForSpace(spaceId: string, limit = 5) {
  if (!(await isReviewsEnabledGlobally())) return [];
  return getPublishedReviewsForSpaceCached(spaceId, limit);
}

/**
 * スペースのレビュー統計（平均評価・件数）
 *
 * feature module の判定を外に出す理由は
 * {@link getPublishedReviewsForSpaceCached} と同じ。
 */
async function getSpaceReviewStatsCached(spaceId: string) {
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

export async function getSpaceReviewStats(spaceId: string) {
  if (!(await isReviewsEnabledGlobally())) {
    return toPlainObject({ averageRating: 0, totalCount: 0 });
  }
  return getSpaceReviewStatsCached(spaceId);
}

/**
 * 複数スペースのレビュー統計を一括取得（スペース一覧カード用）
 *
 * Record<spaceId, stats> を返す（Map は JSON シリアライズ不可のため Record を使用）
 *
 * feature module の判定を外に出す理由は
 * {@link getPublishedReviewsForSpaceCached} と同じ。
 */
async function getSpaceReviewStatsMultipleCached(spaceIds: string[]) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.REVIEWS);

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

export async function getSpaceReviewStatsMultiple(spaceIds: string[]) {
  if (spaceIds.length === 0 || !(await isReviewsEnabledGlobally())) {
    return toPlainObject(
      {} satisfies Record<
        string,
        { averageRating: number; totalCount: number }
      >,
    );
  }
  return getSpaceReviewStatsMultipleCached(spaceIds);
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
