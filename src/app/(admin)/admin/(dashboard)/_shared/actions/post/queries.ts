"use server";

import { prisma } from "@/shared/lib/prisma";
import type { PostWhereInput } from "@/shared/types/prisma";
import { PostStatus } from "@/shared/generated/prisma/enums";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type {
  PostData,
  PostVersionData,
  PostCategoryData,
  PostTagData,
  GetPostsResult,
  PostFilters,
  PostPagination,
} from "@/admin/lib/validations/post";

// =============================================================================
// Helper
// =============================================================================

const checkReadPermission = checkReadPermissionFor("post");

// =============================================================================
// Post Queries
// =============================================================================

/**
 * 投稿記事一覧を取得
 */
export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {},
): Promise<GetPostsResult> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return { posts: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  const { status, categoryId, search } = filters;

  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;

  // Where条件を構築
  const where: PostWhereInput = {};

  if (status === "PUBLISHED") {
    where.status = PostStatus.PUBLISHED;
  } else if (status === "DRAFT") {
    where.status = PostStatus.DRAFT;
  } else if (status === "ARCHIVED") {
    where.status = PostStatus.ARCHIVED;
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { excerpt: { contains: search, mode: "insensitive" } },
      { contentHtml: { contains: search, mode: "insensitive" } },
    ];
  }

  // 総件数と記事一覧を並列取得（N+1解消）
  const [total, posts] = await prisma.$transaction([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        postTags: {
          include: {
            tag: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return toPlainObject({
    posts: posts.map((post) => ({
      ...post,
      postTags: post.postTags.map((pt) => pt.tag),
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * 投稿記事詳細を取得
 */
export async function getPostById(id: string): Promise<PostData | null> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return null;
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      postTags: {
        include: {
          tag: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!post) return null;

  return toPlainObject({
    ...post,
    postTags: post.postTags.map((pt) => pt.tag),
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  });
}

/**
 * バージョン履歴を取得
 */
export async function getPostVersions(
  postId: string,
): Promise<PostVersionData[]> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return [];
  }

  const versions = await prisma.postVersion.findMany({
    where: { postId },
    orderBy: { version: "desc" },
  });

  return toPlainArray(
    versions.map((v) => ({
      ...v,
      createdAt: v.createdAt.toISOString(),
    })),
  );
}

// =============================================================================
// Post Category Queries
// =============================================================================

/**
 * カテゴリ一覧を取得
 */
export async function getPostCategories(): Promise<PostCategoryData[]> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return [];
  }

  const categories = await prisma.postCategory.findMany({
    include: {
      _count: {
        select: { posts: true },
      },
    },
    orderBy: { order: "asc" },
  });

  return toPlainArray(
    categories.map((cat) => ({
      ...cat,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    })),
  );
}

/**
 * カテゴリ詳細を取得
 */
export async function getPostCategoryById(
  id: string,
): Promise<PostCategoryData | null> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return null;
  }

  const category = await prisma.postCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { posts: true },
      },
    },
  });

  if (!category) return null;
  return toPlainObject({
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  });
}

// =============================================================================
// Public Functions (認証不要)
// =============================================================================

export type PublicPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  thumbnailUrl: string;
  /** toISOString() 済み ISO 8601 文字列 */
  publishedAt: string;
};

export type GetPublishedPostsOptions = {
  take?: number;
  orderBy?: "publishedAt" | "viewCount";
  categoryId?: string;
};

/**
 * 公開済み投稿記事一覧を取得（認証不要）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedPosts(
  options: GetPublishedPostsOptions = {},
): Promise<PublicPost[]> {
  const { take = 3, orderBy = "publishedAt", categoryId } = options;

  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
      publishedAt: { not: null },
      ...(categoryId && { categoryId }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      thumbnailUrl: true,
      publishedAt: true,
    },
    orderBy: {
      [orderBy]: "desc",
    },
    take,
  });

  return toPlainArray(
    posts
      .filter((post) => post.publishedAt && post.publishedAt <= new Date())
      .map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        thumbnailUrl: post.thumbnailUrl,
        publishedAt: post.publishedAt!.toISOString(),
      })),
  );
}

// =============================================================================
// Post Tag Queries
// =============================================================================

/**
 * タグ一覧を取得
 */
export async function getPostTags(): Promise<PostTagData[]> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return [];
  }

  const tags = await prisma.postTag.findMany({
    include: {
      _count: {
        select: { posts: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return toPlainArray(
    tags.map((tag) => ({
      ...tag,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
    })),
  );
}

/**
 * タグ詳細を取得
 */
export async function getPostTagById(id: string): Promise<PostTagData | null> {
  const hasPermission = await checkReadPermission();
  if (!hasPermission) {
    return null;
  }

  const tag = await prisma.postTag.findUnique({
    where: { id },
    include: {
      _count: {
        select: { posts: true },
      },
    },
  });

  if (!tag) return null;
  return toPlainObject({
    ...tag,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  });
}
