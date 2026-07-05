import "server-only";

import { prisma } from "@/shared/db/prisma";
import { asPrismaInputJsonValue } from "@/shared/db/json";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  assertAllowedManagedImageUrl,
  assertAllowedManagedImageUrls,
} from "@/shared/domain/media/managed-image-assertions";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
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
  assertAllowedManagedImageUrl("ロケーションメイン画像", data.imageUrl);
  assertAllowedManagedImageUrls(
    data.imageUrls.map((image) => ({
      label: "ロケーション追加画像",
      url: image.url,
    })),
  );

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
    isPublished: data.isPublished,
  };
}

async function ensureLocationExists(id: string): Promise<{
  id: string;
  spaces: number;
}> {
  const location = await prisma.location.findUnique({
    where: { id, isActive: true },
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

  const location = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("locations:active"));

    const maxOrder = await tx.location.aggregate({
      _max: { sortOrder: true },
    });

    return tx.location.create({
      data: {
        ...toLocationData(data),
        // sortOrder はシステム管理（末尾に自動採番、D&D reorder が SSoT）
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
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
  items: readonly { id: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  if (items.length === 0) {
    return { updated: 0 };
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }
  if (new Set(items.map((item) => item.sortOrder)).size !== items.length) {
    throw new DomainError(
      "同じ並び順を複数指定することはできません",
      "VALIDATION",
    );
  }

  const existingLocations = await prisma.location.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const existingIds = new Set(existingLocations.map((location) => location.id));

  for (const item of items) {
    if (!existingIds.has(item.id)) {
      throw new DomainError("場所が見つかりません", "NOT_FOUND");
    }
  }

  if (existingLocations.length !== items.length) {
    throw new DomainError("場所数が一致しません（過不足）", "VALIDATION");
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    items,
    (item) => item.id,
    (item) => item.sortOrder,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("locations:active"));

    await tx.$executeRaw`
      UPDATE "locations"
      SET "sortOrder" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
        AND "isActive" = true
    `;

    await tx.$executeRaw`
      UPDATE "locations"
      SET "sortOrder" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
        AND "isActive" = true
    `;
  });

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
