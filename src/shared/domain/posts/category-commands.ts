import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
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

  const category = await prisma.postCategory.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      order: input.order,
      metaTitle: normalizeNullableString(input.metaTitle),
      metaDescription: normalizeNullableString(input.metaDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
    select: { id: true },
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
      order: input.order,
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

  await prisma.$transaction(async (tx) => {
    for (const item of items) {
      await tx.postCategory.update({
        where: { id: item.id },
        data: { order: item.order },
      });
    }
  });
}
