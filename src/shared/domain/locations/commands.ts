import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import type { BusinessHours } from "@/shared/lib/json-validators";
import type { LocationFormData } from "@/shared/lib/validations/location";

function businessHoursToJson(
  value: BusinessHours | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const;
  const result: Record<
    string,
    { isOpen: boolean; slots: Array<{ openTime: string; closeTime: string }> }
  > = {};

  for (const day of days) {
    const dayData = value[day];
    result[day] = {
      isOpen: dayData.isOpen,
      slots: dayData.slots.map((slot) => ({
        openTime: slot.openTime,
        closeTime: slot.closeTime,
      })),
    };
  }

  return result;
}

function toLocationData(data: LocationFormData) {
  return {
    slug: data.slug,
    name: data.name,
    description: data.description || null,
    address: data.address,
    postalCode: data.postalCode || null,
    prefecture: data.prefecture || null,
    city: data.city || null,
    streetAddress: data.streetAddress || null,
    buildingName: data.buildingName || null,
    accessLines: data.accessLines.map((line) => line.value),
    parkingInfo: data.parkingInfo || null,
    amenities: asPrismaInputJsonValue(data.amenities, "amenities が不正です"),
    imageUrl: data.imageUrl,
    imageUrls: data.imageUrls.map((image) => image.url),
    businessHours: businessHoursToJson(data.businessHours ?? null),
    specialHolidays:
      data.specialHolidays && data.specialHolidays.length > 0
        ? asPrismaInputJsonValue(
            data.specialHolidays,
            "specialHolidays が不正です",
          )
        : Prisma.JsonNull,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    googleBusinessPlaceId: data.googleBusinessPlaceId || null,
    googleReviewUrl: data.googleReviewUrl || null,
    priceRange: data.priceRange || null,
    paymentAccepted: data.paymentAccepted || null,
    phoneNumber: data.phoneNumber || null,
    email: data.email || null,
    sortOrder: data.sortOrder,
    isPublished: data.isPublished,
  };
}

async function ensureLocationExists(id: string): Promise<{
  id: string;
  spaces: number;
}> {
  const location = await prisma.location.findUnique({
    where: { id },
    include: {
      _count: {
        select: { spaces: true },
      },
    },
  });

  if (!location) {
    throw new DomainError("場所が見つかりません", "NOT_FOUND");
  }

  return {
    id: location.id,
    spaces: location._count.spaces,
  };
}

export async function createLocation(
  data: LocationFormData,
): Promise<{ id: string; slug: string }> {
  const existing = await prisma.location.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (existing) {
    throw new DomainError(
      `スラッグ "${data.slug}" は既に使用されています`,
      "DUPLICATE",
    );
  }

  const location = await prisma.location.create({
    data: toLocationData(data),
  });

  return { id: location.id, slug: location.slug };
}

export async function updateLocation(
  id: string,
  data: LocationFormData,
): Promise<{ id: string; slug: string }> {
  await ensureLocationExists(id);

  const slugConflict = await prisma.location.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (slugConflict && slugConflict.id !== id) {
    throw new DomainError(
      `スラッグ "${data.slug}" は既に使用されています`,
      "DUPLICATE",
    );
  }

  await prisma.location.update({
    where: { id },
    data: toLocationData(data),
  });

  return { id, slug: data.slug };
}

export async function updateLocationPublished(
  id: string,
  isPublished: boolean,
): Promise<{ id: string; isPublished: boolean }> {
  await ensureLocationExists(id);

  await prisma.location.update({
    where: { id },
    data: { isPublished },
  });

  return { id, isPublished };
}

export async function updateLocationOrder(
  items: { id: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  await Promise.all(
    items.map((item) =>
      prisma.location.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );

  return { updated: items.length };
}

export async function deleteLocation(id: string): Promise<{ id: string }> {
  const location = await ensureLocationExists(id);

  if (location.spaces > 0) {
    throw new DomainError(
      `この場所には${location.spaces}件のスペースが紐づいています。先にスペースの場所を変更してください。`,
      "CONFLICT",
    );
  }

  await prisma.location.update({
    where: { id },
    data: { isActive: false },
  });

  return { id };
}

export async function hardDeleteLocation(id: string): Promise<{ id: string }> {
  const location = await ensureLocationExists(id);

  if (location.spaces > 0) {
    throw new DomainError(
      `この場所には${location.spaces}件のスペースが紐づいています。`,
      "CONFLICT",
    );
  }

  await prisma.location.delete({
    where: { id },
  });

  return { id };
}
