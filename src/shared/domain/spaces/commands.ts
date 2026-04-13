import "server-only";

import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";

type SpaceCommandInput = {
  slug: string;
  name: string;
  descriptionJson: Prisma.InputJsonValue;
  descriptionHtml: string;
  descriptionPlainText: string;
  addressDetail?: string | null | undefined;
  access?: string | null | undefined;
  capacity: number;
  area?: number | null | undefined;
  hourlyPrice: number;
  dailyPrice?: number | null | undefined;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
  isPublished: boolean;
  reviewsEnabled: boolean;
  termsId?: string | null | undefined;
  locationId: string;
  categoryId?: string | null | undefined;
  discountType?: DiscountType | null | undefined;
  discountValue?: number | null | undefined;
  durationDiscountOverride?: DurationDiscountOverride | null | undefined;
  taxRateType?: TaxRateType | null | undefined;
  metaDescription?: string | null | undefined;
  metaKeywords?: string | null | undefined;
  ogpTitle?: string | null | undefined;
  ogpDescription?: string | null | undefined;
  ogpImageUrl?: string | null | undefined;
};

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return value;
}

function buildSpaceData(input: SpaceCommandInput, publishedAt: Date | null) {
  return {
    slug: input.slug,
    name: input.name,
    descriptionJson: input.descriptionJson,
    descriptionHtml: input.descriptionHtml,
    descriptionPlainText: input.descriptionPlainText,
    addressDetail: normalizeNullableString(input.addressDetail),
    access: normalizeNullableString(input.access),
    capacity: input.capacity,
    area: input.area ?? null,
    hourlyPrice: input.hourlyPrice,
    dailyPrice: input.dailyPrice ?? null,
    mainImageUrl: input.mainImageUrl,
    imageUrls: input.imageUrls,
    facilities: input.facilities,
    isPublished: input.isPublished,
    reviewsEnabled: input.reviewsEnabled,
    publishedAt,
    termsId: input.termsId ?? null,
    locationId: input.locationId,
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

async function ensureSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "space",
    currentId,
  });

  if (!slugCheck.available) {
    throw new DomainError(getSlugErrorMessage(slugCheck.reason), "CONFLICT");
  }
}

async function ensureAssignableLocation(locationId: string): Promise<void> {
  const location = await prisma.location.findFirst({
    where: { id: locationId, isActive: true },
    select: { id: true },
  });
  if (!location) {
    throw new DomainError("拠点が見つからないか、無効です", "VALIDATION");
  }
}

async function ensureAssignableCategory(
  categoryId: string | null | undefined,
): Promise<void> {
  if (categoryId === null || categoryId === undefined) {
    return;
  }
  const category = await prisma.spaceCategory.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });
  if (!category) {
    throw new DomainError("カテゴリーが見つからないか、無効です", "VALIDATION");
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
  await ensureAssignableLocation(input.locationId);
  await ensureAssignableCategory(input.categoryId);

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
  await ensureAssignableLocation(input.locationId);
  await ensureAssignableCategory(input.categoryId);
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
