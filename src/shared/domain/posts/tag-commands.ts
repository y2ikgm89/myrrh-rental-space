import "server-only";

import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { assertAllowedManagedImageUrl } from "@/shared/domain/media/managed-image-assertions";
import { omitUndefined } from "@/shared/lib/serialize";
import type {
  CreatePostTagResult,
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

export async function createPostTag(
  input: PostTagMutationInput,
): Promise<CreatePostTagResult> {
  assertAllowedManagedImageUrl("OGP画像", input.ogpImageUrl);
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
  assertAllowedManagedImageUrl("OGP画像", input.ogpImageUrl);
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
    select: {
      id: true,
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
