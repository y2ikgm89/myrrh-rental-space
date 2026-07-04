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
  parseStringArrayOrNull,
} from "@/shared/lib/json-validators";
import { paginate } from "@/shared/lib/pagination";

function parseAmenities(
  value: Prisma.JsonValue | null,
): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "boolean") result[k] = v;
  }
  return result;
}

function formatLocation(location: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  address: string;
  postalCode: string | null;
  prefecture: string | null;
  city: string | null;
  streetAddress: string | null;
  buildingName: string | null;
  accessLines: Prisma.JsonValue;
  parkingInfo: string | null;
  amenities: Prisma.JsonValue;
  imageUrl: string;
  imageUrls: Prisma.JsonValue | null;
  businessHours: Prisma.JsonValue | null;
  specialHolidays: Prisma.JsonValue | null;
  latitude: number | null;
  longitude: number | null;
  googleBusinessPlaceId: string | null;
  googleReviewUrl: string | null;
  priceRange: string | null;
  paymentAccepted: string | null;
  phoneNumber: string | null;
  email: string | null;
  gbpSyncEnabled: boolean;
  gbpSyncedAt: Date | null;
  gbpSyncError: string | null;
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
    slug: location.slug,
    name: location.name,
    description: location.description,
    address: location.address,
    postalCode: location.postalCode,
    prefecture: location.prefecture,
    city: location.city,
    streetAddress: location.streetAddress,
    buildingName: location.buildingName,
    accessLines: parseStringArray(location.accessLines),
    parkingInfo: location.parkingInfo,
    amenities: parseAmenities(location.amenities),
    imageUrl: location.imageUrl,
    imageUrls: parseStringArray(location.imageUrls),
    businessHours: parseBusinessHours(location.businessHours),
    specialHolidays: parseStringArrayOrNull(location.specialHolidays),
    latitude: location.latitude,
    longitude: location.longitude,
    googleBusinessPlaceId: location.googleBusinessPlaceId,
    googleReviewUrl: location.googleReviewUrl,
    priceRange: location.priceRange,
    paymentAccepted: location.paymentAccepted,
    phoneNumber: location.phoneNumber,
    email: location.email,
    gbpSyncEnabled: location.gbpSyncEnabled,
    gbpSyncedAt: location.gbpSyncedAt
      ? location.gbpSyncedAt.toISOString()
      : null,
    gbpSyncError: location.gbpSyncError,
    sortOrder: location.sortOrder,
    isPublished: location.isPublished,
    isActive: location.isActive,
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
    _count: location._count,
  };
}

const LOCATION_FULL_SELECT = {
  id: true,
  slug: true,
  name: true,
  description: true,
  address: true,
  postalCode: true,
  prefecture: true,
  city: true,
  streetAddress: true,
  buildingName: true,
  accessLines: true,
  parkingInfo: true,
  amenities: true,
  imageUrl: true,
  imageUrls: true,
  businessHours: true,
  specialHolidays: true,
  latitude: true,
  longitude: true,
  googleBusinessPlaceId: true,
  googleReviewUrl: true,
  priceRange: true,
  paymentAccepted: true,
  phoneNumber: true,
  email: true,
  gbpSyncEnabled: true,
  gbpSyncedAt: true,
  gbpSyncError: true,
  sortOrder: true,
  isPublished: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: { spaces: true },
  },
} as const;

export async function getLocations(options: {
  isPublished?: boolean | "ALL";
  search?: string;
  page: number;
  limit: number;
}): Promise<GetLocationsResult> {
  const { isPublished = "ALL", search } = options;
  const { skip, take, page, limit } = paginate({
    page: options.page,
    limit: options.limit,
  });

  const where: Prisma.LocationWhereInput = {
    isActive: true,
    ...(isPublished === "ALL" ? {} : { isPublished }),
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
      take,
      select: LOCATION_FULL_SELECT,
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
    where: { id, isActive: true },
    select: LOCATION_FULL_SELECT,
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
