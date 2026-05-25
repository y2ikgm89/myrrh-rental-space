import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { EventStatus } from "@generated/prisma/client";
import type { EventTabFilter } from "@/shared/lib/nuqs";

const eventListSelect = {
  id: true,
  title: true,
  slug: true,
  startTime: true,
  endTime: true,
  registrationDeadline: true,
  capacity: true,
  addressDetail: true,
  status: true,
  registrationOpen: true,
  publishedAt: true,
  deletedAt: true,
  createdAt: true,
  location: { select: { id: true, name: true } },
  space: { select: { id: true, name: true } },
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
  ogpImageUrl: true,
  ogpTitle: true,
  ogpDescription: true,
  metaDescription: true,
  metaKeywords: true,
  locationId: true,
  spaceId: true,
  googleCalendarEventId: true,
  updatedAt: true,
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
 * - open: PUBLISHED かつ endTime >= now（開催前・開催中）
 * - past: PUBLISHED かつ endTime < now、または ARCHIVED
 * - draft: DRAFT
 * - cancelled: CANCELLED
 * - all: 制約なし（呼び出し側の status フィルタに委譲）
 */
function buildTabWhere(tab: EventTabFilter, now: Date): Prisma.EventWhereInput {
  switch (tab) {
    case "open":
      return { status: EventStatus.PUBLISHED, endTime: { gte: now } };
    case "past":
      return {
        OR: [
          { status: EventStatus.PUBLISHED, endTime: { lt: now } },
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
    page = 1,
    perPage = 10,
    sortBy,
    sortOrder,
  } = options;

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
    ...(dateFrom ? { startTime: { gte: new Date(dateFrom) } } : {}),
    ...(dateTo ? { endTime: { lte: new Date(dateTo) } } : {}),
  };

  const orderBy: Prisma.EventOrderByWithRelationInput = {
    [effectiveSortBy]: effectiveSortOrder,
  };

  const [events, totalCount] = await Promise.all([
    prisma.event.findMany({
      where,
      select: eventListSelect,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.event.count({ where }),
  ]);

  return {
    events,
    total: totalCount,
    page,
    totalPages: Math.ceil(totalCount / perPage),
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
