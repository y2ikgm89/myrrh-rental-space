import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  toPlainArray,
  toPlainObject,
  type Serialized,
} from "@/shared/lib/serialize";
import { parseGallery } from "@/shared/lib/validations/gallery";
import { paginate, calcTotalPages } from "@/shared/lib/pagination";
import { PAGINATION_DEFAULTS } from "@/shared/lib/constants";
import type { EventListTab } from "@/shared/domain/events/event-list-tab";

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
  // Phase B.1: 開催形態 (schema.org eventAttendanceMode / 会場表示用)。
  // meetingUrl / meetingProvider は公開キャッシュ DTO に載せない（登録完了者
  // 向けクエリのみ開示。architecture-boundaries gate で回帰防止）。
  format: true,
  location: { select: { id: true, name: true, address: true } },
  space: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, color: true } },
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
} satisfies Prisma.EventSelect;

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
} satisfies Prisma.EventSelect;

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

/** section-renderer.tsx 等が「取得済みイベント行 → EventCardData」の変換に使う共通ソース型 */
export type PublicEventCardSource = Serialized<
  ReturnType<typeof mapPublicEvent>
>;

export async function getPublishedEvents() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENTS, CACHE_TAGS.LOCATIONS, CACHE_TAGS.SPACES);

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
  cacheTag(CACHE_TAGS.EVENTS, CACHE_TAGS.LOCATIONS, CACHE_TAGS.SPACES);

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

export interface EventListFilter {
  readonly tab: EventListTab;
  readonly q: string;
  readonly categoryId: string | null;
  readonly page?: number | undefined;
  readonly perPage?: number | undefined;
}

/**
 * q はタイトルのみを ILIKE 対象にする(既存 `events_title_trgm_idx` を活用)。
 * admin 側の `searchEvents`(`admin-queries.ts` の `buildTabWhere` 隣接ロジック)も
 * title/addressDetail/location.name/space.name の OR で本文(descriptionPlainText)
 * は対象外にしており、descriptionPlainText には trigram index が無いため
 * ILIKE がシーケンシャルスキャンになる。既存パターンとの一貫性を優先しタイトルのみとする。
 */
function buildEventListWhereClause(
  filter: EventListFilter,
  now: Date,
): Prisma.EventWhereInput {
  const tabWhere: Prisma.EventWhereInput =
    filter.tab === "upcoming"
      ? { slots: { some: { endAt: { gte: now } } } }
      : { NOT: { slots: { some: { endAt: { gte: now } } } } };

  const where: Prisma.EventWhereInput = {
    status: EventStatus.PUBLISHED,
    deletedAt: null,
    ...tabWhere,
  };

  const q = filter.q.trim();
  if (q) {
    where.title = { contains: q, mode: "insensitive" };
  }

  if (filter.categoryId) {
    where.categoryId = filter.categoryId;
  }

  return where;
}

/**
 * 公開 `/events` list variant のページネーション付き取得。
 *
 * `'use cache'` 非対応(tab 判定に `new Date()` を使うため、呼び出し側が
 * `await connection()` 済みの動的スコープで呼ぶ必要がある。既存
 * `getUpcomingEventsExcluding` と同じ理由)。
 *
 * orderBy は `Event.firstSlotStartAt`/`lastSlotEndAt`(`schema.prisma` の
 * フィールドコメント)が示す意図の通り: upcoming は開催が近い順、
 * past は終了が遅い順(直近に終わったものを先に見せる)。
 */
export async function getPublishedEventsPaginated(filter: EventListFilter) {
  const now = new Date();
  const page = Math.max(1, filter.page ?? 1);
  const perPage = filter.perPage ?? PAGINATION_DEFAULTS.public.default;
  const where = buildEventListWhereClause(filter, now);
  const orderBy: Prisma.EventOrderByWithRelationInput =
    filter.tab === "upcoming"
      ? { firstSlotStartAt: { sort: "asc", nulls: "last" } }
      : { lastSlotEndAt: { sort: "desc", nulls: "last" } };
  const { skip, take, limit } = paginate({ page, limit: perPage });

  return safeFetch({
    fetch: async () => {
      const [rawItems, totalCount] = await Promise.all([
        prisma.event.findMany({
          where,
          select: publicEventSelect,
          orderBy,
          skip,
          take,
        }),
        prisma.event.count({ where }),
      ]);
      return {
        items: toPlainArray(rawItems.map(mapPublicEvent)),
        totalCount,
        totalPages: calcTotalPages(totalCount, limit),
        currentPage: page,
      };
    },
    fallback: { items: [], totalCount: 0, totalPages: 0, currentPage: page },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedEventsPaginated",
  });
}
