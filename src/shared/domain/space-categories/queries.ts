import "server-only";

import { prisma } from "@/shared/db/prisma";
import { paginate } from "@/shared/lib/pagination";
import type {
  GetSpaceCategoriesResult,
  SpaceCategoryWithStats,
} from "@/shared/lib/validations/space-category";

type ActiveSpaceCategoryOption = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

export async function getSpaceCategories(options: {
  includeInactive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<GetSpaceCategoriesResult> {
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
    prisma.spaceCategory.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      skip,
      take,
      include: {
        _count: {
          select: { spaces: true },
        },
      },
    }),
    prisma.spaceCategory.count({ where }),
  ]);

  const formattedCategories: SpaceCategoryWithStats[] = categories.map(
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

export async function getSpaceCategoryById(
  id: string,
): Promise<SpaceCategoryWithStats | null> {
  const category = await prisma.spaceCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { spaces: true },
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

export async function getActiveSpaceCategories(): Promise<
  ActiveSpaceCategoryOption[]
> {
  return prisma.spaceCategory.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      icon: true,
      color: true,
    },
  });
}
