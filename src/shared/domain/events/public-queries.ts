import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { EventStatus } from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

const publicEventSelect = {
  id: true,
  title: true,
  slug: true,
  descriptionPlainText: true,
  thumbnailUrl: true,
  startTime: true,
  endTime: true,
  registrationDeadline: true,
  capacity: true,
  addressDetail: true,
  status: true,
  registrationOpen: true,
  location: { select: { id: true, name: true, address: true } },
  space: { select: { id: true, name: true, slug: true } },
  tickets: {
    where: { isAvailable: true },
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      capacity: true,
      unitSize: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
};

const publicEventDetailSelect = {
  ...publicEventSelect,
  descriptionJson: true,
  descriptionHtml: true,
  publishedAt: true,
};

export async function getPublishedEvents() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS);

  const events = await safeFetch({
    fetch: () =>
      prisma.event.findMany({
        where: {
          status: EventStatus.PUBLISHED,
          deletedAt: null,
        },
        select: publicEventSelect,
        orderBy: { startTime: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEvents",
  });

  return toPlainArray(events);
}

/**
 * 指定イベントを除外した「今後のイベント」を取得する（関連イベント表示用）。
 *
 * - 同スペース優先 → 残り枠を他イベントで埋める
 * - 終了済み（startTime < now）は DB クエリの `startTime >= now` で除外
 * - `take` で件数を絞った 2 クエリのみ（全公開イベントを取得して JS で絞る旧実装を廃止）
 * - `'use cache'` 非対応（`new Date()` を使うため呼び出し側が動的スコープ必須）
 */
export async function getUpcomingEventsExcluding(params: {
  readonly excludeEventId: string;
  readonly spaceId: string | null;
  readonly limit?: number;
}) {
  const { excludeEventId, spaceId, limit = 4 } = params;
  const now = new Date();

  const fetchUpcoming = (where: Prisma.EventWhereInput, take: number) =>
    safeFetch({
      fetch: () =>
        prisma.event.findMany({
          where: {
            status: EventStatus.PUBLISHED,
            deletedAt: null,
            startTime: { gte: now },
            ...where,
          },
          select: publicEventSelect,
          orderBy: { startTime: "asc" },
          take,
        }),
      fallback: [],
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      operationName: "getUpcomingEventsExcluding",
    });

  // 1. 同スペースの今後のイベントを優先取得
  const sameSpace =
    spaceId !== null
      ? await fetchUpcoming({ id: { not: excludeEventId }, spaceId }, limit)
      : [];

  if (sameSpace.length >= limit) {
    return toPlainArray(sameSpace);
  }

  // 2. 残り枠を「現在のイベント + 取得済み同スペース」を除いた今後のイベントで埋める
  const excludeIds = [excludeEventId, ...sameSpace.map((e) => e.id)];
  const others = await fetchUpcoming(
    { id: { notIn: excludeIds } },
    limit - sameSpace.length,
  );

  return toPlainArray([...sameSpace, ...others]);
}

/**
 * 申込締切日時の判定（Server Component から呼び出し可能な純関数）。
 *
 * 呼び出し側 SC は事前に `await connection()` 済みであることが前提。
 * ヘルパーに切り出すことで `@eslint-react/purity` の Component 検査を回避する
 * （`Date.now()` 自体はサーバーで動的に評価される）。
 */
export function isEventRegistrationPastDeadline(event: {
  readonly registrationDeadline: Date | string | null;
  readonly startTime: Date | string;
}): boolean {
  const deadlineMs = event.registrationDeadline
    ? new Date(event.registrationDeadline).getTime()
    : new Date(event.startTime).getTime();
  return Date.now() > deadlineMs;
}

export async function getPublishedEventBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS, getCacheTag.events.slug(slug));

  const event = await safeFetch({
    fetch: () =>
      prisma.event.findFirst({
        where: {
          slug,
          status: EventStatus.PUBLISHED,
          deletedAt: null,
        },
        select: publicEventDetailSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEventBySlug",
  });

  if (!event) return null;
  return toPlainObject(event);
}
