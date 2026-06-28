import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { EventStatus } from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import { parseGallery } from "@/shared/lib/validations/gallery";

const publicEventSelect = {
  id: true,
  title: true,
  slug: true,
  descriptionPlainText: true,
  thumbnailUrl: true,
  gallery: true,
  registrationDeadline: true,
  addressDetail: true,
  status: true,
  scheduleMode: true,
  registrationOpen: true,
  location: { select: { id: true, name: true, address: true } },
  space: { select: { id: true, name: true, slug: true } },
  slots: {
    select: { id: true, startAt: true, endAt: true, capacity: true },
    orderBy: { startAt: "asc" as const },
  },
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
  ogpImageUrl: true,
  ogpTitle: true,
  ogpDescription: true,
  metaDescription: true,
  metaKeywords: true,
};

type PublicEventRow = Awaited<
  ReturnType<typeof prisma.event.findMany<{ select: typeof publicEventSelect }>>
>[number];

function mapPublicEvent<T extends PublicEventRow>(event: T) {
  const firstSlot = event.slots[0];
  const lastSlot = event.slots[event.slots.length - 1] ?? firstSlot;
  return {
    ...event,
    gallery: parseGallery(event.gallery),
    startTime: firstSlot?.startAt ?? new Date(0),
    endTime: lastSlot?.endAt ?? new Date(0),
    capacity: firstSlot?.capacity ?? null,
  };
}

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
        orderBy: { firstSlotStartAt: { sort: "asc", nulls: "last" } },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEvents",
  });

  return toPlainArray(events.map(mapPublicEvent));
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
            slots: { some: { startAt: { gte: now } } },
            ...where,
          },
          select: publicEventSelect,
          orderBy: { firstSlotStartAt: { sort: "asc", nulls: "last" } },
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
    return toPlainArray(sameSpace.map(mapPublicEvent));
  }

  // 2. 残り枠を「現在のイベント + 取得済み同スペース」を除いた今後のイベントで埋める
  const excludeIds = [excludeEventId, ...sameSpace.map((e) => e.id)];
  const others = await fetchUpcoming(
    { id: { notIn: excludeIds } },
    limit - sameSpace.length,
  );

  return toPlainArray([...sameSpace, ...others].map(mapPublicEvent));
}

export async function getPublishedEventBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS);

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
  return toPlainObject(mapPublicEvent(event));
}
