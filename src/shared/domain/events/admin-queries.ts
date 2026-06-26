import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { EventStatus } from "@generated/prisma/client";
import type { EventTabFilter } from "@/shared/lib/nuqs";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";

const eventListSelect = {
  id: true,
  title: true,
  slug: true,
  registrationDeadline: true,
  addressDetail: true,
  status: true,
  registrationOpen: true,
  publishedAt: true,
  deletedAt: true,
  createdAt: true,
  location: { select: { id: true, name: true } },
  space: { select: { id: true, name: true } },
  slots: {
    select: { startAt: true, endAt: true, capacity: true },
    orderBy: { startAt: "asc" as const },
    take: 1,
  },
  tickets: {
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      capacity: true,
      unitSize: true,
      sortOrder: true,
      isAvailable: true,
    },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.EventSelect;

const eventDetailSelect = {
  ...eventListSelect,
  descriptionJson: true,
  descriptionHtml: true,
  descriptionPlainText: true,
  thumbnailUrl: true,
  gallery: true,
  ogpImageUrl: true,
  ogpTitle: true,
  ogpDescription: true,
  metaDescription: true,
  metaKeywords: true,
  locationId: true,
  spaceId: true,
  updatedAt: true,
  slots: {
    select: {
      id: true,
      startAt: true,
      endAt: true,
      capacity: true,
      googleCalendarEventId: true,
    },
    orderBy: { startAt: "asc" as const },
  },
} satisfies Prisma.EventSelect;

interface GetEventsOptions {
  search?: string;
  status?: EventStatus;
  tab?: EventTabFilter;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

/**
 * タブ別の where 句を生成する。
 * - open: PUBLISHED かつ endAt >= now のスロットが存在（開催前・開催中）
 * - past: PUBLISHED かつ全スロットが終了、または ARCHIVED
 * - draft: DRAFT
 * - cancelled: CANCELLED
 * - all: 制約なし（呼び出し側の status フィルタに委譲）
 */
function buildTabWhere(tab: EventTabFilter, now: Date): Prisma.EventWhereInput {
  switch (tab) {
    case "open":
      return {
        status: EventStatus.PUBLISHED,
        slots: { some: { endAt: { gte: now } } },
      };
    case "past":
      return {
        OR: [
          {
            status: EventStatus.PUBLISHED,
            NOT: { slots: { some: { endAt: { gte: now } } } },
          },
          { status: EventStatus.ARCHIVED },
        ],
      };
    case "draft":
      return { status: EventStatus.DRAFT };
    case "cancelled":
      return { status: EventStatus.CANCELLED };
    case "all":
      return {};
  }
}

/**
 * ソートキーを Prisma の orderBy に変換する。
 * "startTime" / "endTime" は Prisma 7 でリレーション集計ソート非対応のため createdAt にフォールバック。
 * TODO: firstSlotStartAt 非正規化列を Event に追加して semantic sort を復元する。
 */
function buildEventOrderBy(
  sortBy: string,
  sortOrder: "asc" | "desc",
): Prisma.EventOrderByWithRelationInput {
  if (sortBy === "startTime" || sortBy === "endTime") {
    return { createdAt: sortOrder };
  }
  return { [sortBy]: sortOrder };
}

/** タブ別のデフォルトソート（URL に sortBy/sortOrder が指定されていない場合の初期値） */
function getDefaultSort(tab: EventTabFilter): {
  sortBy: string;
  sortOrder: "asc" | "desc";
} {
  switch (tab) {
    case "open":
      return { sortBy: "startTime", sortOrder: "asc" };
    case "past":
      return { sortBy: "endTime", sortOrder: "desc" };
    case "draft":
      return { sortBy: "updatedAt", sortOrder: "desc" };
    case "cancelled":
      return { sortBy: "startTime", sortOrder: "desc" };
    case "all":
      return { sortBy: "startTime", sortOrder: "desc" };
  }
}

export async function getEvents(options: GetEventsOptions = {}) {
  const {
    search = "",
    status,
    tab = "all",
    dateFrom = "",
    dateTo = "",
    sortBy,
    sortOrder,
  } = options;
  const {
    skip,
    take,
    page,
    limit: perPage,
  } = paginate({ page: options.page, limit: options.perPage ?? 10 });

  const now = new Date();
  const tabWhere = buildTabWhere(tab, now);
  const defaults = getDefaultSort(tab);
  const effectiveSortBy = sortBy ?? defaults.sortBy;
  const effectiveSortOrder = sortOrder ?? defaults.sortOrder;

  const where: Prisma.EventWhereInput = {
    deletedAt: null,
    ...tabWhere,
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { addressDetail: { contains: search, mode: "insensitive" } },
            { location: { name: { contains: search, mode: "insensitive" } } },
            { space: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
    // status Select は tab="all" でのみ有効（他タブは tab が status を上書きするため UI で非表示）
    ...(tab === "all" && status ? { status } : {}),
    ...(dateFrom
      ? { slots: { some: { startAt: { gte: new Date(dateFrom) } } } }
      : {}),
    ...(dateTo
      ? { slots: { some: { endAt: { lte: new Date(dateTo) } } } }
      : {}),
  };

  const orderBy = buildEventOrderBy(effectiveSortBy, effectiveSortOrder);

  const [events, totalCount] = await Promise.all([
    prisma.event.findMany({
      where,
      select: eventListSelect,
      orderBy,
      skip,
      take,
    }),
    prisma.event.count({ where }),
  ]);

  return {
    events,
    total: totalCount,
    page,
    totalPages: calcTotalPages(totalCount, perPage),
  };
}

export async function getEventById(id: string) {
  return prisma.event.findFirst({
    where: { id, deletedAt: null },
    select: eventDetailSelect,
  });
}

export async function getSpacesForEvent() {
  return prisma.space.findMany({
    where: { isPublished: true, isActive: true },
    select: { id: true, name: true, locationId: true },
    orderBy: { name: "asc" },
  });
}

export async function getLocationsForEvent() {
  return prisma.location.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
