import "server-only";

import { PostStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  CreatePostCategoryResult,
  CreatePostTagResult,
  PostCategoryMutationInput,
  PostTagMutationInput,
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

async function ensurePostTagUnique(
  input: PostTagMutationInput,
  currentId?: string,
): Promise<void> {
  const duplicate = await prisma.postTag.findFirst({
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
    throw new DomainError("このタグ名は既に使用されています", "CONFLICT");
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
    include: {
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

  await prisma.$transaction(
    items.map((item) =>
      prisma.postCategory.update({
        where: { id: item.id },
        data: { order: item.order },
      }),
    ),
  );
}

export async function createPostTag(
  input: PostTagMutationInput,
): Promise<CreatePostTagResult> {
  await ensurePostTagUnique(input);

  const tag = await prisma.postTag.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      metaTitle: normalizeNullableString(input.metaTitle),
      metaDescription: normalizeNullableString(input.metaDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
    select: { id: true },
  });

  return tag;
}

export async function updatePostTag(
  id: string,
  input: PostTagMutationInput,
): Promise<void> {
  await ensurePostTagUnique(input, id);

  const tag = await prisma.postTag.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!tag) {
    throw new DomainError("タグが見つかりません", "NOT_FOUND");
  }

  await prisma.postTag.update({
    where: { id },
    data: {
      name: input.name,
      slug: input.slug,
      description: normalizeNullableString(input.description),
      metaTitle: normalizeNullableString(input.metaTitle),
      metaDescription: normalizeNullableString(input.metaDescription),
      ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    },
  });
}

export async function deletePostTag(id: string): Promise<void> {
  const tag = await prisma.postTag.findUnique({
    where: { id },
    include: {
      _count: {
        select: { posts: true },
      },
    },
  });

  if (!tag) {
    throw new DomainError("タグが見つかりません", "NOT_FOUND");
  }

  if (tag._count.posts > 0) {
    throw new DomainError(
      "このタグは記事で使用されているため削除できません",
      "CONFLICT",
    );
  }

  await prisma.postTag.delete({
    where: { id },
  });
}

export async function bulkTogglePublishedCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; isPublished: boolean }> {
  const result = await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: {
      status: publish ? PostStatus.PUBLISHED : PostStatus.DRAFT,
      publishedAt: publish ? new Date() : null,
    },
  });
  return { count: result.count, isPublished: publish };
}

export async function bulkDeletePostsCommand(
  ids: string[],
): Promise<{ count: number }> {
  const result = await prisma.post.deleteMany({
    where: { id: { in: ids } },
  });
  return { count: result.count };
}
