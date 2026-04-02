import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import type {
  GetLocationsResult,
  LocationWithStats,
  PublishedLocationOption,
} from "@/shared/domain/locations/types";
import {
  parseBusinessHours,
  parseStringArray,
} from "@/shared/lib/json-validators";

function formatLocation(location: {
  id: string;
  name: string;
  description: string | null;
  address: string;
  access: string | null;
  imageUrl: string;
  imageUrls: Prisma.JsonValue | null;
  businessHours: Prisma.JsonValue | null;
  sortOrder: number;
  isPublished: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    spaces: number;
  };
}): LocationWithStats {
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    address: location.address,
    access: location.access,
    imageUrl: location.imageUrl,
    imageUrls: parseStringArray(location.imageUrls),
    businessHours: parseBusinessHours(location.businessHours),
    sortOrder: location.sortOrder,
    isPublished: location.isPublished,
    isActive: location.isActive,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
    _count: location._count,
  };
}

export async function getLocations(options: {
  includeInactive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<GetLocationsResult> {
  const { includeInactive = false, search } = options;
  const page = Math.max(1, options.page);
  const limit = Math.max(1, options.limit);
  const skip = (page - 1) * limit;

  const where: Prisma.LocationWhereInput = {
    ...(includeInactive ? {} : { isActive: true }),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { address: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [locations, total] = await Promise.all([
    prisma.location.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        description: true,
        address: true,
        access: true,
        imageUrl: true,
        imageUrls: true,
        businessHours: true,
        sortOrder: true,
        isPublished: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { spaces: true },
        },
      },
    }),
    prisma.location.count({ where }),
  ]);

  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    locations: locations.map(formatLocation),
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getLocationById(
  id: string,
): Promise<LocationWithStats | null> {
  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      _count: {
        select: { spaces: true },
      },
    },
  });

  if (!location) {
    return null;
  }

  return formatLocation(location);
}

export async function getPublishedLocations(): Promise<
  PublishedLocationOption[]
> {
  return prisma.location.findMany({
    where: { isPublished: true, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
    },
  });
}

/** スペース編集で紐づけ可能な拠点（公開前の建物も含む） */
export async function getActiveLocationsForSelect(): Promise<
  PublishedLocationOption[]
> {
  return prisma.location.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
    },
  });
}
