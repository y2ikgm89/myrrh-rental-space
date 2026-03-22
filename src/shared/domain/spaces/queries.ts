import "server-only";

import { prisma, type Prisma } from "@/shared/db/prisma";
import {
  parseBusinessHours,
  parseStringArray,
} from "@/shared/lib/json-validators";
import {
  getValidDiscountType,
  getValidDurationDiscountOverride,
} from "@/shared/lib/validations/enums/helpers";
import type { TaxRateType } from "@/shared/db/enums";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

function formatSpaceToPlain(s: {
  id: string;
  slug: string;
  name: string;
  description: string;
  addressDetail: string | null;
  access: string | null;
  capacity: number;
  area: number | null;
  hourlyPrice: number;
  dailyPrice: number | null;
  mainImageUrl: string;
  imageUrls: unknown;
  facilities: unknown;
  businessHours: Prisma.JsonValue | null;
  isPublished: boolean;
  publishedAt: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  termsId: string | null;
  locationId: string;
  categoryId: string | null;
  location: { address: string };
  category: { id: string; name: string } | null;
  discountType: string | null;
  discountValue: number | null;
  durationDiscountOverride: string | null;
  taxRateType: TaxRateType;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
  _count: { reservations: number };
}) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    addressDetail: s.addressDetail,
    displayAddress: formatSpaceLineAddress(s.location.address, s.addressDetail),
    access: s.access,
    capacity: s.capacity,
    area: s.area,
    hourlyPrice: s.hourlyPrice,
    dailyPrice: s.dailyPrice,
    mainImageUrl: s.mainImageUrl,
    imageUrls: parseStringArray(s.imageUrls),
    facilities: parseStringArray(s.facilities),
    businessHours: parseBusinessHours(s.businessHours),
    isPublished: s.isPublished,
    publishedAt: s.publishedAt ? s.publishedAt.toISOString() : null,
    isActive: s.isActive,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    termsId: s.termsId,
    locationId: s.locationId,
    categoryId: s.categoryId,
    category: s.category,
    discountType: getValidDiscountType(s.discountType),
    discountValue: s.discountValue,
    durationDiscountOverride: getValidDurationDiscountOverride(
      s.durationDiscountOverride,
    ),
    taxRateType: s.taxRateType,
    metaDescription: s.metaDescription,
    metaKeywords: s.metaKeywords,
    ogpTitle: s.ogpTitle,
    ogpDescription: s.ogpDescription,
    ogpImageUrl: s.ogpImageUrl,
    _count: { reservations: s._count.reservations },
  };
}

export async function getSpacesQuery(
  filters: {
    isPublished?: boolean | "ALL" | undefined;
    search?: string | undefined;
    locationId?: string | undefined;
    categoryId?: string | undefined;
    uncategorizedOnly?: boolean | undefined;
  } = {},
  pagination: {
    page?: number;
    limit?: number;
    sortBy?: "createdAt" | "name" | "updatedAt" | "hourlyPrice";
    sortOrder?: "asc" | "desc";
  } = {},
) {
  const { isPublished, search, locationId, categoryId, uncategorizedOnly } =
    filters;
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;

  const where: {
    isActive: boolean;
    isPublished?: boolean;
    locationId?: string;
    categoryId?: string | null;
    OR?: Array<
      | { name: { contains: string; mode: "insensitive" } }
      | { addressDetail: { contains: string; mode: "insensitive" } }
      | { description: { contains: string; mode: "insensitive" } }
      | { location: { address: { contains: string; mode: "insensitive" } } }
    >;
  } = {
    isActive: true,
  };

  if (isPublished !== undefined && isPublished !== "ALL") {
    where.isPublished = isPublished;
  }

  if (locationId) {
    where.locationId = locationId;
  }

  if (uncategorizedOnly) {
    where.categoryId = null;
  } else if (categoryId) {
    where.categoryId = categoryId;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { addressDetail: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { location: { address: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [total, spaces] = await prisma.$transaction([
    prisma.space.count({ where }),
    prisma.space.findMany({
      where,
      include: {
        location: { select: { address: true } },
        category: { select: { id: true, name: true } },
        _count: {
          select: {
            reservations: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    spaces: spaces.map(formatSpaceToPlain),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getSpaceByIdQuery(id: string) {
  const space = await prisma.space.findUnique({
    where: { id },
    include: {
      location: { select: { address: true } },
      category: { select: { id: true, name: true } },
      _count: {
        select: {
          reservations: true,
        },
      },
    },
  });

  if (!space) {
    return null;
  }

  return formatSpaceToPlain(space);
}

export async function getSpaceStatsQuery() {
  const [total, published, spaces] = await Promise.all([
    prisma.space.count({ where: { isActive: true } }),
    prisma.space.count({ where: { isActive: true, isPublished: true } }),
    prisma.space.findMany({
      where: { isActive: true },
      select: { capacity: true },
    }),
  ]);

  const totalCapacity = spaces.reduce((sum, space) => sum + space.capacity, 0);

  return {
    total,
    published,
    unpublished: total - published,
    totalCapacity,
  };
}

export async function getSpacesForSelectQuery() {
  const spaces = await prisma.space.findMany({
    where: { isActive: true, isPublished: true },
    select: {
      id: true,
      slug: true,
      name: true,
      mainImageUrl: true,
      hourlyPrice: true,
      capacity: true,
    },
    orderBy: { name: "asc" },
  });

  return spaces.map((space) => ({
    id: space.id,
    slug: space.slug,
    name: space.name,
    mainImageUrl: space.mainImageUrl,
    hourlyPrice: String(space.hourlyPrice),
    capacity: space.capacity,
  }));
}
