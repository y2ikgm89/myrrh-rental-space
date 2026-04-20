import "server-only";

import { cacheLife, cacheTag } from "next/cache";
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
  capacity: true,
  price: true,
  location: true,
  status: true,
  registrationOpen: true,
  space: { select: { id: true, name: true, slug: true } },
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
 * - 同スペース優先 → 残りを他スペースで埋める
 * - 終了済み（startTime < now）は除外
 * - `'use cache'` 非対応（`new Date()` を使うため呼び出し側が動的スコープ必須）
 */
export async function getUpcomingEventsExcluding(params: {
  readonly excludeEventId: string;
  readonly spaceId: string | null;
  readonly limit?: number;
}) {
  const { excludeEventId, spaceId, limit = 4 } = params;

  const all = await getPublishedEvents();
  const now = Date.now();
  const future = all.filter(
    (e) => e.id !== excludeEventId && new Date(e.startTime).getTime() >= now,
  );

  const sameSpace =
    spaceId !== null ? future.filter((e) => e.space?.id === spaceId) : [];
  const otherSpaces = future.filter((e) => e.space?.id !== spaceId);
  return [...sameSpace, ...otherSpaces].slice(0, limit);
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
