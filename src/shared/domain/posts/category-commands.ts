import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Prisma } from "@generated/prisma/client";
import { DomainError } from "@/shared/domain/domain-error";
import {
  buildOrderScopeLockSql,
  buildUuidOrderSqlFragments,
} from "@/shared/domain/order-sql";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  CreatePostCategoryResult,
  PostCategoryMutationInput,
} from "@/shared/domain/posts/types";

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return value;
}

async function ensurePostCategoryExists(id: string): Promise<void> {
  const category = await prisma.postCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }
}

async function ensurePostCategoryUnique(
  input: PostCategoryMutationInput,
  currentId?: string,
): Promise<void> {
  const duplicate = await prisma.postCategory.findFirst({
    where: omitUndefined({
      id: currentId ? { not: currentId } : undefined,
      OR: [{ name: input.name }, { slug: input.slug }],
    }),
    select: { name: true, slug: true },
  });

  if (!duplicate) {
    return;
  }

  if (duplicate.name === input.name) {
    throw new DomainError("このカテゴリ名は既に使用されています", "CONFLICT");
  }

  throw new DomainError("このスラッグは既に使用されています", "CONFLICT");
}

export async function createPostCategory(
  input: PostCategoryMutationInput,
): Promise<CreatePostCategoryResult> {
  await ensurePostCategoryUnique(input);

  const category = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("post_categories:all"));

    const maxOrder = await tx.postCategory.aggregate({
      _max: { order: true },
    });

    return tx.postCategory.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: normalizeNullableString(input.description),
        // order はシステム管理（末尾に自動採番、D&D reorder が SSoT）
        order: (maxOrder._max.order ?? -1) + 1,
        metaTitle: normalizeNullableString(input.metaTitle),
        metaDescription: normalizeNullableString(input.metaDescription),
        ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
      },
      select: { id: true },
    });
  });

  return category;
}

export async function updatePostCategory(
  id: string,
  input: PostCategoryMutationInput,
): Promise<void> {
  await ensurePostCategoryUnique(input, id);
  await ensurePostCategoryExists(id);

  await prisma.postCategory.update({
    where: { id },
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      // order は変更しない（位置は updatePostCategoryOrder のみが変更）
      metaTitle: normalizeNullableString(input.metaTitle),
      metaDescription: normalizeNullableString(input.metaDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
  });
}

export async function deletePostCategory(id: string): Promise<void> {
  const category = await prisma.postCategory.findUnique({
    where: { id },
    select: {
      id: true,
      _count: {
        select: { posts: true },
      },
    },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }

  if (category._count.posts > 0) {
    throw new DomainError(
      "このカテゴリには記事が紐づいているため削除できません",
      "CONFLICT",
    );
  }

  await prisma.postCategory.delete({
    where: { id },
  });
}

export async function updatePostCategoryOrder(
  items: { id: string; order: number }[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new DomainError("同じIDを複数指定することはできません", "VALIDATION");
  }
  if (new Set(items.map((item) => item.order)).size !== items.length) {
    throw new DomainError(
      "同じ順序を複数指定することはできません",
      "VALIDATION",
    );
  }

  const existing = await prisma.postCategory.findMany({
    select: { id: true },
  });
  const existingIds = new Set(existing.map((category) => category.id));

  for (const item of items) {
    if (!existingIds.has(item.id)) {
      throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
    }
  }

  if (existing.length !== items.length) {
    throw new DomainError("カテゴリ数が一致しません（過不足）", "VALIDATION");
  }

  const { ids, tempCases, finalCases } = buildUuidOrderSqlFragments(
    items,
    (item) => item.id,
    (item) => item.order,
  );

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(buildOrderScopeLockSql("post_categories:all"));

    await tx.$executeRaw`
      UPDATE "post_categories"
      SET "order" = CASE "id" ${Prisma.join(tempCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;

    await tx.$executeRaw`
      UPDATE "post_categories"
      SET "order" = CASE "id" ${Prisma.join(finalCases, " ")} END
      WHERE "id" IN (${Prisma.join(ids)})
    `;
  });
}
