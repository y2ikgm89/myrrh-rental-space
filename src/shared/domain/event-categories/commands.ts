import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import type { EventCategoryFormData } from "@/shared/lib/validations/event-category";

type EventCategoryOrderInput = {
  id: string;
  sortOrder: number;
};

/**
 * name の一意性は isActive: true な行の間でのみ強制される partial unique
 * index（SpaceCategory と同型）。無効化済みカテゴリーの名前を永久に予約しない。
 */
async function ensureNameAvailable(
  name: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.eventCategory.findFirst({
    where: {
      name,
      isActive: true,
      ...(currentId ? { id: { not: currentId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new DomainError("同じ名前のカテゴリーが既に存在します", "CONFLICT");
  }
}

function toEventCategoryData(data: EventCategoryFormData) {
  return {
    name: data.name,
    description: data.description || null,
    icon: data.icon || null,
    color: data.color || null,
  };
}

export async function createEventCategory(
  data: EventCategoryFormData,
): Promise<{ id: string }> {
  await ensureNameAvailable(data.name);

  const category = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("event_categories:all"));

    const maxOrder = await tx.eventCategory.aggregate({
      _max: { sortOrder: true },
    });

    return tx.eventCategory.create({
      data: {
        ...toEventCategoryData(data),
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  });

  return { id: category.id };
}

export async function updateEventCategory(
  id: string,
  data: EventCategoryFormData,
): Promise<{ id: string }> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  await ensureNameAvailable(data.name, id);

  await prisma.eventCategory.update({
    where: { id },
    data: toEventCategoryData(data),
  });

  return { id };
}

export async function updateEventCategoryOrder(
  items: readonly EventCategoryOrderInput[],
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

  const existingCategories = await prisma.eventCategory.findMany({
    select: { id: true },
  });
  const existingIds = new Set(
    existingCategories.map((category) => category.id),
  );

  for (const item of items) {
    if (!existingIds.has(item.id)) {
      throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
    }
  }

  if (existingCategories.length !== items.length) {
    throw new DomainError("カテゴリー数が一致しません（過不足）", "VALIDATION");
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    items,
    (item) => item.id,
    (item) => item.sortOrder,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("event_categories:all"));

    await tx.$executeRaw`
      UPDATE "event_categories"
      SET sort_order = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;

    await tx.$executeRaw`
      UPDATE "event_categories"
      SET sort_order = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  });

  return { updated: items.length };
}

export async function deleteEventCategory(id: string): Promise<{ id: string }> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { events: true },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  if (category._count.events > 0) {
    throw new DomainError(
      `このカテゴリーには${category._count.events}件のイベントが紐づいています。先にイベントのカテゴリーを変更してください。`,
      "CONFLICT",
    );
  }

  await prisma.eventCategory.update({
    where: { id },
    data: { isActive: false },
  });

  return { id };
}

export async function updateEventCategoryActive(
  id: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const category = await prisma.eventCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { events: true },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  if (!isActive && category._count.events > 0) {
    throw new DomainError(
      `このカテゴリーには${category._count.events}件のイベントが紐づいています。先にイベントのカテゴリーを変更してください。`,
      "CONFLICT",
    );
  }

  if (isActive) {
    await ensureNameAvailable(category.name, id);
  }

  await prisma.eventCategory.update({
    where: { id },
    data: { isActive },
  });

  return { id, isActive };
}
