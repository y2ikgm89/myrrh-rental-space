import "server-only";
import { PostStatus } from "@/shared/lib/validations/enums/prisma-types";
import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import {
  assertAllowedManagedImageSourcesInJson,
  assertAllowedManagedImageUrls,
} from "@/shared/domain/media/managed-image-assertions";
import { isPrismaUniqueConstraintError } from "@/shared/lib/prisma-errors";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import type {
  CreatePostCommandInput,
  CreatePostResult,
  DeletePostResult,
  PublishPostResult,
  UpdatePostBodyCommandInput,
  UpdatePostSettingsCommandInput,
  UpdatePostResult,
} from "@/shared/domain/posts/types";

const POST_SLUG_CONFLICT_MESSAGE = getSlugErrorMessage({
  type: "conflict",
  contentType: "post",
  id: "",
});

function rethrowPostSlugConflict(error: unknown): never {
  if (isPrismaUniqueConstraintError(error, "slug")) {
    throw new DomainError(POST_SLUG_CONFLICT_MESSAGE, "CONFLICT");
  }
  throw error;
}

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

function resolvePostPublishedAt(
  status: PostStatus,
  publishedAt: Date | null,
): Date | null {
  if (status !== PostStatus.PUBLISHED) {
    return null;
  }

  return publishedAt ?? new Date();
}

async function ensurePostExists(
  id: string,
): Promise<{ id: string; slug: string }> {
  const post = await prisma.post.findFirst({
    where: { id, deletedAt: null },
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

export async function createPost(
  input: CreatePostCommandInput,
): Promise<CreatePostResult> {
  assertAllowedManagedImageUrls([
    { label: "サムネイル画像", url: input.thumbnailUrl },
    { label: "OGP画像", url: input.ogpImageUrl },
  ]);
  assertAllowedManagedImageSourcesInJson("本文画像", input.contentJson);

  await Promise.all([
    ensurePostSlugAvailable(input.slug),
    ensurePostCategoryExists(input.categoryId),
    ensurePostTagsExist(input.tags),
  ]);

  try {
    const post = await prisma.post.create({
      data: omitUndefined({
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
        contentWidth: input.contentWidth ?? null,
        contentWidthCustom: input.contentWidthCustom ?? null,
        status: PostStatus.DRAFT,
        authorId: input.authorId,
        postTags: {
          create: input.tags.map((tagId) => ({ tagId })),
        },
      }),
      select: {
        id: true,
        slug: true,
      },
    });

    return post;
  } catch (error) {
    rethrowPostSlugConflict(error);
  }
}

/**
 * 投稿記事の本文（contentJson / contentHtml）のみを更新する。
 *
 * 設定（タイトル・スラッグ・分類・SEO 等）は変更しない。
 * 設定の更新は `updatePostSettings` を使用する。
 */
export async function updatePostBody(
  id: string,
  input: UpdatePostBodyCommandInput,
): Promise<UpdatePostResult> {
  assertAllowedManagedImageSourcesInJson("本文画像", input.contentJson);
  const existingPost = await ensurePostExists(id);

  await prisma.post.update({
    where: { id, deletedAt: null },
    data: omitUndefined({
      contentHtml: input.contentHtml,
      contentJson: parseContentJson(input.contentJson),
    }),
  });

  return {
    oldSlug: existingPost.slug,
    slug: existingPost.slug,
  };
}

/**
 * 投稿記事の設定（メタデータ・分類・タグ・レイアウト・SEO/OGP）のみを更新する。
 *
 * 本文（contentJson / contentHtml）は変更しない。
 * 本文の更新は `updatePostBody` を使用する。
 */
export async function updatePostSettings(
  id: string,
  input: UpdatePostSettingsCommandInput,
): Promise<UpdatePostResult> {
  assertAllowedManagedImageUrls([
    { label: "サムネイル画像", url: input.thumbnailUrl },
    { label: "OGP画像", url: input.ogpImageUrl },
  ]);

  const existingPost = await ensurePostExists(id);

  await Promise.all([
    ensurePostSlugAvailable(input.slug, id),
    ensurePostCategoryExists(input.categoryId),
    ensurePostTagsExist(input.tags),
  ]);

  try {
    await prisma.post.update({
      where: { id, deletedAt: null },
      data: {
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt,
        thumbnailUrl: input.thumbnailUrl,
        ogpImageUrl: normalizeNullableString(input.ogpImageUrl),
        categoryId: input.categoryId,
        metaDescription: normalizeNullableString(input.metaDescription),
        metaKeywords: normalizeNullableString(input.metaKeywords),
        ogpTitle: normalizeNullableString(input.ogpTitle),
        ogpDescription: normalizeNullableString(input.ogpDescription),
        status: input.status,
        publishedAt: resolvePostPublishedAt(input.status, input.publishedAt),
        contentWidth: input.contentWidth,
        contentWidthCustom: input.contentWidthCustom,
        postTags: {
          deleteMany: {},
          create: input.tags.map((tagId) => ({ tagId })),
        },
      },
    });
  } catch (error) {
    rethrowPostSlugConflict(error);
  }

  return {
    oldSlug: existingPost.slug,
    slug: input.slug,
  };
}

/** 投稿の現在 status を取得する（設定更新の RBAC 判定用）。見つからなければ null。 */
export async function getPostStatus(id: string): Promise<PostStatus | null> {
  const post = await prisma.post.findFirst({
    where: { id, deletedAt: null },
    select: { status: true },
  });
  return post?.status ?? null;
}

export async function deletePost(id: string): Promise<DeletePostResult> {
  const post = await ensurePostExists(id);

  await prisma.post.update({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  return {
    slug: post.slug,
  };
}

export async function restorePost(id: string): Promise<DeletePostResult> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true, deletedAt: true },
  });

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  if (post.deletedAt === null) {
    throw new DomainError("この投稿は削除されていません", "VALIDATION");
  }

  const conflict = await prisma.post.findFirst({
    where: { slug: post.slug, deletedAt: null, id: { not: id } },
    select: { id: true },
  });
  if (conflict) {
    throw new DomainError(POST_SLUG_CONFLICT_MESSAGE, "CONFLICT");
  }

  try {
    await prisma.post.update({
      where: { id },
      data: { deletedAt: null },
    });
  } catch (error) {
    rethrowPostSlugConflict(error);
  }

  return {
    slug: post.slug,
  };
}

export async function permanentlyDeletePost(
  id: string,
): Promise<DeletePostResult> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true, deletedAt: true },
  });

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  if (post.deletedAt === null) {
    throw new DomainError(
      "先にソフトデリートしてから完全削除してください",
      "CONFLICT",
    );
  }

  await prisma.post.delete({
    where: { id },
  });

  return {
    slug: post.slug,
  };
}

export async function publishPost(id: string): Promise<PublishPostResult> {
  const post = await prisma.post.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, slug: true, publishedAt: true },
  });

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  await prisma.post.update({
    where: { id, deletedAt: null },
    data: {
      status: PostStatus.PUBLISHED,
      publishedAt: post.publishedAt ?? new Date(),
    },
  });

  return {
    slug: post.slug,
  };
}

export async function unpublishPost(id: string): Promise<DeletePostResult> {
  const post = await ensurePostExists(id);

  await prisma.post.update({
    where: { id, deletedAt: null },
    data: {
      status: PostStatus.DRAFT,
      publishedAt: null,
    },
  });

  return {
    slug: post.slug,
  };
}

export async function archivePost(id: string): Promise<DeletePostResult> {
  const post = await ensurePostExists(id);

  await prisma.post.update({
    where: { id, deletedAt: null },
    data: {
      status: PostStatus.ARCHIVED,
      publishedAt: null,
    },
  });

  return {
    slug: post.slug,
  };
}
