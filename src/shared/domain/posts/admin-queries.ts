import "server-only";

import { prisma } from "@/shared/db/prisma";
import { isValidPostStatus } from "@/shared/lib/validations/enums/guards";
import { calcTotalPages, paginate } from "@/shared/lib/pagination";
import type { Prisma } from "@generated/prisma/client";

type PostWhereInput = Prisma.PostWhereInput;
import type {
  GetPostsResult,
  PostCategoryData,
  PostData,
  PostFilters,
  PostPagination,
  PostTagData,
} from "@/shared/domain/posts/types";

function buildPostWhere(filters: PostFilters): PostWhereInput {
  const where: PostWhereInput = {
    deletedAt: null,
  };

  if (isValidPostStatus(filters.status)) {
    where.status = filters.status;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.authorId) {
    where.authorId = filters.authorId;
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

export type DeletedPostListItem = {
  id: string;
  title: string;
  slug: string;
  deletedAt: string;
  status: PostData["status"];
  category: { name: string };
};

/**
 * Recycle Bin: ソフトデリート済み投稿一覧（ゴミ箱テーブル用）。
 */
/**
 * 並べ替えのキーは**リテラルで持つ**。`{ [sortBy]: … }` と書くと、どの列で
 * 並ぶのかが静的に読めなくなり、enum 列の宣言順に依存していても
 * `enum-order-dependencies.test.ts` が検出できない。
 */
function postOrderBy(
  sortBy: NonNullable<PostPagination["sortBy"]>,
  direction: "asc" | "desc",
): Prisma.PostOrderByWithRelationInput {
  switch (sortBy) {
    case "createdAt":
      return { createdAt: direction };
    case "publishedAt":
      return { publishedAt: direction };
    case "title":
      return { title: direction };
  }
}

export async function getDeletedPosts(): Promise<DeletedPostListItem[]> {
  const posts = await prisma.post.findMany({
    where: { deletedAt: { not: null } },
    select: {
      id: true,
      title: true,
      slug: true,
      deletedAt: true,
      status: true,
      category: {
        select: { name: true },
      },
    },
    orderBy: { deletedAt: "desc" },
  });

  return posts.flatMap((post) => {
    if (post.deletedAt === null) {
      return [];
    }
    return [
      {
        id: post.id,
        title: post.title,
        slug: post.slug,
        deletedAt: post.deletedAt.toISOString(),
        status: post.status,
        category: post.category,
      },
    ];
  });
}

export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {},
): Promise<GetPostsResult> {
  const { sortBy = "createdAt", sortOrder = "desc" } = pagination;
  const { skip, take, page, limit } = paginate(pagination);
  const where = buildPostWhere(filters);

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        publishedAt: true,
        createdAt: true,
        status: true,
        category: {
          select: { name: true },
        },
      },
      orderBy: postOrderBy(sortBy, sortOrder),
      skip,
      take,
    }),
  ]);

  return {
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      category: post.category,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      status: post.status,
    })),
    total,
    page,
    limit,
    totalPages: calcTotalPages(total, limit),
  };
}

export async function getPostById(id: string): Promise<PostData | null> {
  const post = await prisma.post.findFirst({
    where: { id, deletedAt: null },
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
        // 表示件数はアクティブ記事のみ（ゴミ箱は除外）
        select: { posts: { where: { deletedAt: null } } },
      },
      // 削除可否用: ゴミ箱含む紐づけの有無
      posts: { select: { id: true }, take: 1 },
    },
    orderBy: { order: "asc" },
  });

  return categories.map(({ posts, ...category }) => ({
    ...category,
    hasLinkedPostsIncludingTrash: posts.length > 0,
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
        select: { posts: { where: { deletedAt: null } } },
      },
      posts: { select: { id: true }, take: 1 },
    },
  });

  if (!category) {
    return null;
  }

  const { posts, ...rest } = category;
  return {
    ...rest,
    hasLinkedPostsIncludingTrash: posts.length > 0,
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
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
        // 表示件数はアクティブ記事のみ（ゴミ箱は除外）
        select: { posts: { where: { post: { deletedAt: null } } } },
      },
      posts: { select: { postId: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  return tags.map(({ posts, ...tag }) => ({
    ...tag,
    hasLinkedPostsIncludingTrash: posts.length > 0,
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
        select: { posts: { where: { post: { deletedAt: null } } } },
      },
      posts: { select: { postId: true }, take: 1 },
    },
  });

  if (!tag) {
    return null;
  }

  const { posts, ...rest } = tag;
  return {
    ...rest,
    hasLinkedPostsIncludingTrash: posts.length > 0,
    createdAt: rest.createdAt.toISOString(),
    updatedAt: rest.updatedAt.toISOString(),
  };
}
