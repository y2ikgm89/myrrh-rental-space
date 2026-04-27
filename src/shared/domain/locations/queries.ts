import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import type {
  GetLocationsResult,
  LocationData,
  LocationWithStats,
  PublishedLocationOption,
} from "@/shared/domain/locations/types";
import {
  parseBusinessHours,
  parseStringArray,
  parseStringArrayOrNull,
} from "@/shared/lib/json-validators";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import { slugParamSchema } from "@/shared/lib/validations/params";

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
  access: string | null;
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
    access: location.access,
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
  access: true,
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
    where: { id },
    select: LOCATION_FULL_SELECT,
  });

  if (!location) {
    return null;
  }

  return formatLocation(location);
}

export async function getLocationBySlug(
  slug: string,
): Promise<LocationData | null> {
  const validated = slugParamSchema.safeParse(slug);
  if (!validated.success) return null;

  const location = await safeFetch({
    fetch: () =>
      prisma.location.findUnique({
        where: { slug: validated.data },
        select: {
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
          access: true,
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
          sortOrder: true,
          isPublished: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getLocationBySlug",
  });

  if (!location) return null;

  return toPlainObject({
    ...location,
    amenities: parseAmenities(location.amenities),
    imageUrls: parseStringArray(location.imageUrls),
    businessHours: parseBusinessHours(location.businessHours),
    specialHolidays: parseStringArrayOrNull(location.specialHolidays),
    createdAt: location.createdAt.toISOString(),
    updatedAt: location.updatedAt.toISOString(),
  });
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
