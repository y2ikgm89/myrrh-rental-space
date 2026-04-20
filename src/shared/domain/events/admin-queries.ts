import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { isValidEventStatus } from "@/shared/lib/validations/enums/guards";

const eventListSelect = {
  id: true,
  title: true,
  slug: true,
  startTime: true,
  endTime: true,
  registrationDeadline: true,
  capacity: true,
  price: true,
  addressDetail: true,
  status: true,
  registrationOpen: true,
  publishedAt: true,
  deletedAt: true,
  createdAt: true,
  location: { select: { id: true, name: true } },
  space: { select: { id: true, name: true } },
} satisfies Prisma.EventSelect;

const eventDetailSelect = {
  ...eventListSelect,
  descriptionJson: true,
  descriptionHtml: true,
  descriptionPlainText: true,
  thumbnailUrl: true,
  locationId: true,
  spaceId: true,
  googleCalendarEventId: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;

interface GetEventsOptions {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export async function getEvents(options: GetEventsOptions = {}) {
  const {
    search = "",
    status = "",
    dateFrom = "",
    dateTo = "",
    page = 1,
    perPage = 10,
    sortBy = "startTime",
    sortOrder = "desc",
  } = options;

  const where: Prisma.EventWhereInput = {
    deletedAt: null,
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
    ...(isValidEventStatus(status) ? { status } : {}),
    ...(dateFrom ? { startTime: { gte: new Date(dateFrom) } } : {}),
    ...(dateTo ? { endTime: { lte: new Date(dateTo) } } : {}),
  };

  const orderBy: Prisma.EventOrderByWithRelationInput = {
    [sortBy]: sortOrder,
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
