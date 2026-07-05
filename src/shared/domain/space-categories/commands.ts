import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import type { SpaceCategoryFormData } from "@/shared/lib/validations/space-category";

type SpaceCategoryOrderInput = {
  id: string;
  sortOrder: number;
};

async function ensureNameAvailable(
  name: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.spaceCategory.findFirst({
    where: {
      name,
      ...(currentId ? { id: { not: currentId } } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    throw new DomainError("同じ名前のカテゴリーが既に存在します", "CONFLICT");
  }
}

function toSpaceCategoryData(data: SpaceCategoryFormData) {
  return {
    name: data.name,
    description: data.description || null,
    icon: data.icon || null,
    color: data.color || null,
  };
}

export async function createSpaceCategory(
  data: SpaceCategoryFormData,
): Promise<{ id: string }> {
  await ensureNameAvailable(data.name);

  const category = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("space_categories:all"));

    const maxOrder = await tx.spaceCategory.aggregate({
      _max: { sortOrder: true },
    });

    return tx.spaceCategory.create({
      data: {
        ...toSpaceCategoryData(data),
        // sortOrder はシステム管理（末尾に自動採番、D&D reorder が SSoT）
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
  });

  return { id: category.id };
}

export async function updateSpaceCategory(
  id: string,
  data: SpaceCategoryFormData,
): Promise<{ id: string }> {
  const category = await prisma.spaceCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  await ensureNameAvailable(data.name, id);

  await prisma.spaceCategory.update({
    where: { id },
    data: toSpaceCategoryData(data),
  });

  return { id };
}

export async function updateSpaceCategoryOrder(
  items: readonly SpaceCategoryOrderInput[],
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

  const existingCategories = await prisma.spaceCategory.findMany({
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
    await tx.$executeRaw(buildOrderScopeLockSql("space_categories:all"));

    await tx.$executeRaw`
      UPDATE "space_categories"
      SET "sortOrder" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;

    await tx.$executeRaw`
      UPDATE "space_categories"
      SET "sortOrder" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  });

  return { updated: items.length };
}

export async function deleteSpaceCategory(id: string): Promise<{ id: string }> {
  const category = await prisma.spaceCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { spaces: true },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  if (category._count.spaces > 0) {
    throw new DomainError(
      `このカテゴリーには${category._count.spaces}件のスペースが紐づいています。先にスペースのカテゴリーを変更してください。`,
      "CONFLICT",
    );
  }

  await prisma.spaceCategory.update({
    where: { id },
    data: { isActive: false },
  });

  return { id };
}

export async function updateSpaceCategoryActive(
  id: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const category = await prisma.spaceCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { spaces: true },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリーが見つかりません", "NOT_FOUND");
  }

  // 非アクティブ化時はスペース紐づきを確認（公開ページから silent に消える事故を防ぐ）
  if (!isActive && category._count.spaces > 0) {
    throw new DomainError(
      `このカテゴリーには${category._count.spaces}件のスペースが紐づいています。先にスペースのカテゴリーを変更してください。`,
      "CONFLICT",
    );
  }

  if (isActive) {
    await ensureNameAvailable(category.name, id);
  }

  await prisma.spaceCategory.update({
    where: { id },
    data: { isActive },
  });

  return { id, isActive };
}
