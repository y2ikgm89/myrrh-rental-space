import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { paginate } from "@/shared/lib/pagination";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import type {
  GetEventCategoriesResult,
  EventCategoryWithStats,
} from "@/shared/lib/validations/event-category";

type ActiveEventCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export async function getEventCategories(options: {
  includeInactive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<GetEventCategoriesResult> {
  const { includeInactive = false, search } = options;
  const { skip, take, page, limit } = paginate({
    page: options.page,
    limit: options.limit,
  });

  const where = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            {
              description: { contains: search, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };

  const [categories, total] = await Promise.all([
    prisma.eventCategory.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      skip,
      take,
      include: {
        _count: {
          select: { events: true },
        },
      },
    }),
    prisma.eventCategory.count({ where }),
  ]);

  const formattedCategories: EventCategoryWithStats[] = categories.map(
    (category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      icon: category.icon,
      color: category.color,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
      _count: category._count,
    }),
  );

  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    categories: formattedCategories,
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getEventCategoryById(
  id: string,
): Promise<EventCategoryWithStats | null> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { events: true },
      },
    },
  });

  if (!category) {
    return null;
  }

  return {
    id: category.id,
    name: category.name,
    description: category.description,
    icon: category.icon,
    color: category.color,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
    _count: category._count,
  };
}

export async function getActiveEventCategories(): Promise<
  ActiveEventCategoryOption[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.EVENT_CATEGORIES);

  return safeFetch({
    fetch: () =>
      prisma.eventCategory.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, icon: true, color: true },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getActiveEventCategories",
  });
}
