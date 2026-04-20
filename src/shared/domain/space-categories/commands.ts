import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import type { SpaceCategoryFormData } from "@/shared/lib/validations/space-category";

type SpaceCategoryOrderInput = {
  id: string;
  sortOrder: number;
};

async function ensureActiveNameAvailable(
  name: string,
  currentId?: string,
): Promise<void> {
  const existing = await prisma.spaceCategory.findFirst({
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

function toSpaceCategoryData(data: SpaceCategoryFormData) {
  return {
    name: data.name,
    description: data.description || null,
    icon: data.icon || null,
    color: data.color || null,
    sortOrder: data.sortOrder,
  };
}

export async function createSpaceCategory(
  data: SpaceCategoryFormData,
): Promise<{ id: string }> {
  await ensureActiveNameAvailable(data.name);

  const category = await prisma.spaceCategory.create({
    data: toSpaceCategoryData(data),
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

  await ensureActiveNameAvailable(data.name, id);

  await prisma.spaceCategory.update({
    where: { id },
    data: toSpaceCategoryData(data),
  });

  return { id };
}

export async function updateSpaceCategoryOrder(
  items: SpaceCategoryOrderInput[],
): Promise<{ updated: number }> {
  await Promise.all(
    items.map((item) =>
      prisma.spaceCategory.update({
        where: { id: item.id },
        data: { sortOrder: item.sortOrder },
      }),
    ),
  );

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

export async function hardDeleteSpaceCategory(
  id: string,
): Promise<{ id: string }> {
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
      `このカテゴリーには${category._count.spaces}件のスペースが紐づいています。`,
      "CONFLICT",
    );
  }

  await prisma.spaceCategory.delete({
    where: { id },
  });

  return { id };
}
