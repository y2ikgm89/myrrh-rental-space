import "server-only";

import { prisma, Prisma } from "@/shared/db/prisma";
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
    name: data.name,
    description: data.description || null,
    address: data.address,
    access: data.access || null,
    imageUrl: data.imageUrl,
    imageUrls: data.imageUrls.map((image) => image.url),
    businessHours: businessHoursToJson(data.businessHours ?? null),
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
): Promise<{ id: string }> {
  const location = await prisma.location.create({
    data: toLocationData(data),
  });

  return { id: location.id };
}

export async function updateLocation(
  id: string,
  data: LocationFormData,
): Promise<{ id: string }> {
  await ensureLocationExists(id);

  await prisma.location.update({
    where: { id },
    data: toLocationData(data),
  });

  return { id };
}

export async function toggleLocationPublish(
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
  await prisma.$transaction(
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
