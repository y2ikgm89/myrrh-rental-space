import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DiscountType, DurationDiscountOverride, TaxRateType } from "@/shared/db/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums";
import { checkSlugAvailability, getSlugErrorMessage } from "@/shared/lib/slug-validation";

type SpaceCommandInput = {
  slug: string;
  name: string;
  description: string;
  address: string;
  access?: string | null;
  capacity: number;
  area?: number | null;
  hourlyPrice: number;
  dailyPrice?: number | null;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
  isPublished: boolean;
  termsId?: string | null;
  locationId?: string | null;
  categoryId?: string | null;
  discountType?: DiscountType | null;
  discountValue?: number | null;
  durationDiscountOverride?: DurationDiscountOverride | null;
  taxRateType?: TaxRateType | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  ogpImageUrl?: string | null;
};

function normalizeNullableString(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value;
}

function buildSpaceData(input: SpaceCommandInput, publishedAt: Date | null) {
  return {
    slug: input.slug,
    name: input.name,
    description: input.description,
    address: input.address,
    access: normalizeNullableString(input.access),
    capacity: input.capacity,
    area: input.area ?? null,
    hourlyPrice: input.hourlyPrice,
    dailyPrice: input.dailyPrice ?? null,
    mainImageUrl: input.mainImageUrl,
    imageUrls: input.imageUrls,
    facilities: input.facilities,
    isPublished: input.isPublished,
    publishedAt,
    termsId: input.termsId ?? null,
    locationId: input.locationId ?? null,
    categoryId: input.categoryId ?? null,
    discountType: input.discountType ?? DiscountType.none,
    discountValue: input.discountValue ?? null,
    durationDiscountOverride:
      input.durationDiscountOverride ?? DurationDiscountOverride.inherit,
    taxRateType: input.taxRateType ?? TaxRateType.standard,
    metaDescription: normalizeNullableString(input.metaDescription),
    metaKeywords: normalizeNullableString(input.metaKeywords),
    ogpTitle: normalizeNullableString(input.ogpTitle),
    ogpDescription: normalizeNullableString(input.ogpDescription),
    ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
  };
}

async function ensureSlugAvailable(slug: string, currentId?: string): Promise<void> {
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "space",
    currentId,
  });

  if (!slugCheck.available) {
    throw new DomainError(getSlugErrorMessage(slugCheck.reason), "CONFLICT");
  }
}

async function ensureSpaceExists(id: string) {
  const space = await prisma.space.findUnique({
    where: { id },
    select: { id: true, isPublished: true, publishedAt: true },
  });

  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  return space;
}

export async function createSpaceCommand(
  input: SpaceCommandInput,
): Promise<{ id: string }> {
  await ensureSlugAvailable(input.slug);

  const space = await prisma.space.create({
    data: buildSpaceData(input, input.isPublished ? new Date() : null),
    select: { id: true },
  });

  return space;
}

export async function updateSpaceCommand(
  id: string,
  input: SpaceCommandInput,
): Promise<void> {
  const existingSpace = await ensureSpaceExists(id);
  await ensureSlugAvailable(input.slug, id);

  let publishedAt = existingSpace.publishedAt;
  if (input.isPublished && !existingSpace.isPublished) {
    publishedAt = new Date();
  } else if (!input.isPublished) {
    publishedAt = null;
  }

  await prisma.space.update({
    where: { id },
    data: buildSpaceData(input, publishedAt),
  });
}

export async function updateSpacePublishCommand(
  id: string,
  isPublished: boolean,
): Promise<void> {
  await ensureSpaceExists(id);

  await prisma.space.update({
    where: { id },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });
}

export async function deleteSpaceCommand(id: string): Promise<void> {
  const space = await prisma.space.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          reservations: {
            where: {
              status: { in: [...ACTIVE_RESERVATION_STATUSES] },
            },
          },
        },
      },
    },
  });

  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  if (space._count.reservations > 0) {
    throw new DomainError("有効な予約があるため削除できません", "VALIDATION");
  }

  await prisma.space.update({
    where: { id },
    data: {
      isActive: false,
      isPublished: false,
    },
  });
}

export async function toggleSpacePublishedCommand(
  id: string,
): Promise<{ isPublished: boolean }> {
  const space = await prisma.space.findUnique({
    where: { id },
    select: { id: true, isPublished: true },
  });

  if (!space) {
    throw new DomainError("スペースが見つかりません", "NOT_FOUND");
  }

  const isPublished = !space.isPublished;

  await prisma.space.update({
    where: { id },
    data: {
      isPublished,
      publishedAt: isPublished ? new Date() : null,
    },
  });

  return { isPublished };
}
