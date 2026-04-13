import "server-only";

import { PostStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import type { PostWhereInput } from "@/shared/types/prisma";
import type {
  GetPostsResult,
  PostCategoryData,
  PostData,
  PostFilters,
  PostPagination,
  PostTagData,
  PostVersionData,
} from "@/shared/domain/posts/types";

function buildPostWhere(filters: PostFilters): PostWhereInput {
  const where: PostWhereInput = {};

  if (filters.status === "PUBLISHED") {
    where.status = PostStatus.PUBLISHED;
  } else if (filters.status === "DRAFT") {
    where.status = PostStatus.DRAFT;
  } else if (filters.status === "ARCHIVED") {
    where.status = PostStatus.ARCHIVED;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { excerpt: { contains: filters.search, mode: "insensitive" } },
      { contentHtml: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {},
): Promise<GetPostsResult> {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;
  const where = buildPostWhere(filters);

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        thumbnailUrl: true,
        ogpImageUrl: true,
        categoryId: true,
        metaDescription: true,
        metaKeywords: true,
        ogpTitle: true,
        ogpDescription: true,
        publishedAt: true,
        status: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        contentWidth: true,
        contentWidthCustom: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
        author: {
          select: { id: true, name: true, email: true },
        },
        postTags: {
          select: {
            tag: { select: { id: true, name: true, slug: true } },
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

  return {
    posts: posts.map((post) => ({
      ...post,
      postTags: post.postTags.map((postTag) => postTag.tag),
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPostById(id: string): Promise<PostData | null> {
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

  if (!post) {
    return null;
  }

  return {
    ...post,
    postTags: post.postTags.map((postTag) => postTag.tag),
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

export async function getPostVersions(
  postId: string,
): Promise<PostVersionData[]> {
  const versions = await prisma.postVersion.findMany({
    where: { postId },
    select: {
      id: true,
      postId: true,
      version: true,
      contentHtml: true,
      contentJson: true,
      createdAt: true,
      createdBy: true,
    },
    orderBy: { version: "desc" },
  });

  return versions.map((version) => ({
    ...version,
    createdAt: version.createdAt.toISOString(),
  }));
}

export async function getPostCategories(): Promise<PostCategoryData[]> {
  const categories = await prisma.postCategory.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      order: true,
      metaTitle: true,
      metaDescription: true,
      ogpImageUrl: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { posts: true },
      },
    },
    orderBy: { order: "asc" },
  });

  return categories.map((category) => ({
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  }));
}

export async function getPostCategoryById(
  id: string,
): Promise<PostCategoryData | null> {
  const category = await prisma.postCategory.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      order: true,
      metaTitle: true,
      metaDescription: true,
      ogpImageUrl: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { posts: true },
      },
    },
  });

  if (!category) {
    return null;
  }

  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

export async function getPostTags(): Promise<PostTagData[]> {
  const tags = await prisma.postTag.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
      ogpImageUrl: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { posts: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return tags.map((tag) => ({
    ...tag,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  }));
}

export async function getPostTagById(id: string): Promise<PostTagData | null> {
  const tag = await prisma.postTag.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
      ogpImageUrl: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { posts: true },
      },
    },
  });

  if (!tag) {
    return null;
  }

  return {
    ...tag,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}
