import "server-only";

import { PostStatus } from "@generated/prisma/enums";
import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import type {
  CreatePostBackupResult,
  CreatePostCategoryResult,
  CreatePostCommandInput,
  CreatePostResult,
  CreatePostTagResult,
  DeletePostResult,
  PostCategoryMutationInput,
  PostTagMutationInput,
  PublishPostResult,
  RestorePostVersionResult,
  UpdatePostCommandInput,
  UpdatePostResult,
} from "@/shared/domain/posts/types";

function parseContentJson(contentJson: string) {
  if (!contentJson) {
    return undefined;
  }

  return parsePrismaInputJson(contentJson, "本文データが不正です");
}

function normalizeNullableString(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  return value;
}

async function ensurePostExists(
  id: string,
): Promise<{ id: string; slug: string }> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  return post;
}

async function ensurePostSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "post",
    currentId,
  });

  if (!slugCheck.available) {
    throw new DomainError(getSlugErrorMessage(slugCheck.reason), "CONFLICT");
  }
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

async function ensurePostTagsExist(tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) {
    return;
  }

  const count = await prisma.postTag.count({
    where: {
      id: {
        in: tagIds,
      },
    },
  });

  if (count !== tagIds.length) {
    throw new DomainError("タグが見つかりません", "NOT_FOUND");
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

function buildPostData(input: CreatePostCommandInput | UpdatePostCommandInput) {
  return {
    title: input.title,
    slug: input.slug,
    excerpt: input.excerpt,
    contentHtml: input.contentHtml,
    contentJson: parseContentJson(input.contentJson),
    thumbnailUrl: input.thumbnailUrl,
    ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
    categoryId: input.categoryId,
    metaDescription: normalizeNullableString(input.metaDescription),
    metaKeywords: normalizeNullableString(input.metaKeywords),
    ogpTitle: normalizeNullableString(input.ogpTitle),
    ogpDescription: normalizeNullableString(input.ogpDescription),
  };
}

export async function createPost(
  input: CreatePostCommandInput,
): Promise<CreatePostResult> {
  await Promise.all([
    ensurePostSlugAvailable(input.slug),
    ensurePostCategoryExists(input.categoryId),
    ensurePostTagsExist(input.tags),
  ]);

  const post = await prisma.post.create({
    data: {
      ...omitUndefined(buildPostData(input)),
      status: PostStatus.DRAFT,
      authorId: input.authorId,
      postTags: {
        create: input.tags.map((tagId) => ({ tagId })),
      },
    },
    select: {
      id: true,
      slug: true,
    },
  });

  return post;
}

export async function updatePost(
  id: string,
  input: UpdatePostCommandInput,
): Promise<UpdatePostResult> {
  const existingPost = await ensurePostExists(id);

  await Promise.all([
    ensurePostSlugAvailable(input.slug, id),
    ensurePostCategoryExists(input.categoryId),
    ensurePostTagsExist(input.tags),
  ]);

  await prisma.post.update({
    where: { id },
    data: {
      ...omitUndefined(buildPostData(input)),
      contentWidth: input.contentWidth,
      contentWidthCustom: input.contentWidthCustom,
      postTags: {
        deleteMany: {},
        create: input.tags.map((tagId) => ({ tagId })),
      },
    },
  });

  return {
    oldSlug: existingPost.slug,
    slug: input.slug,
  };
}

export async function deletePost(id: string): Promise<DeletePostResult> {
  const post = await ensurePostExists(id);

  await prisma.post.delete({
    where: { id },
  });

  return {
    slug: post.slug,
  };
}

export async function publishPost(
  id: string,
  userId: string,
): Promise<PublishPostResult> {
  const [post, latestVersion] = await Promise.all([
    prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        publishedAt: true,
        contentHtml: true,
        contentJson: true,
      },
    }),
    prisma.postVersion.findFirst({
      where: { postId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  const version = (latestVersion?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.post.update({
      where: { id },
      data: {
        status: PostStatus.PUBLISHED,
        publishedAt: post.publishedAt ?? new Date(),
      },
    }),
    prisma.postVersion.create({
      data: omitUndefined({
        postId: id,
        version,
        contentHtml: post.contentHtml,
        contentJson: post.contentJson ?? undefined,
        createdBy: userId,
      }),
    }),
  ]);

  return {
    slug: post.slug,
    version,
  };
}

export async function unpublishPost(id: string): Promise<DeletePostResult> {
  const post = await ensurePostExists(id);

  await prisma.post.update({
    where: { id },
    data: {
      status: PostStatus.DRAFT,
    },
  });

  return {
    slug: post.slug,
  };
}

export async function createPostBackup(
  id: string,
  userId: string,
): Promise<CreatePostBackupResult> {
  const [post, latestVersion] = await Promise.all([
    prisma.post.findUnique({
      where: { id },
      select: { id: true, contentHtml: true, contentJson: true },
    }),
    prisma.postVersion.findFirst({
      where: { postId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  const version = (latestVersion?.version ?? 0) + 1;

  await prisma.postVersion.create({
    data: omitUndefined({
      postId: id,
      version,
      contentHtml: post.contentHtml,
      contentJson: post.contentJson ?? undefined,
      createdBy: userId,
    }),
  });

  return { version };
}

export async function restorePostVersion(
  postId: string,
  version: number,
): Promise<RestorePostVersionResult> {
  const [versionData, post] = await Promise.all([
    prisma.postVersion.findUnique({
      where: {
        postId_version: { postId, version },
      },
      select: { contentHtml: true, contentJson: true },
    }),
    prisma.post.findUnique({
      where: { id: postId },
      select: { slug: true },
    }),
  ]);

  if (!versionData) {
    throw new DomainError("バージョンが見つかりません", "NOT_FOUND");
  }

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  await prisma.post.update({
    where: { id: postId },
    data: omitUndefined({
      contentHtml: versionData.contentHtml,
      contentJson: versionData.contentJson ?? undefined,
      status: PostStatus.DRAFT,
    }),
  });

  return {
    slug: post.slug,
  };
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
