"use server";

import { z } from "zod";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import {
  getPostById as getPostByIdQuery,
  getPostCategories as getPostCategoriesQuery,
  getPostCategoryById as getPostCategoryByIdQuery,
  getPosts as getPostsQuery,
  getPostTagById as getPostTagByIdQuery,
  getPostTags as getPostTagsQuery,
  getPostVersions as getPostVersionsQuery,
} from "@/shared/domain/posts/admin-queries";
import type {
  GetPostsResult,
  PostCategoryData,
  PostData,
  PostFilters,
  PostPagination,
  PostTagData,
  PostVersionData,
} from "@/shared/domain/posts/types";

const checkReadPermission = checkReadPermissionFor("post");
const idSchema = z.string().uuid({ error: "IDが不正です" });

export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {},
): Promise<GetPostsResult> {
  if (!(await checkReadPermission())) {
    return { posts: [], total: 0, page: 1, limit: 10, totalPages: 0 };
  }

  return getPostsQuery(filters, pagination);
}

export async function getPostById(id: string): Promise<PostData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getPostByIdQuery(validated.data);
}

export async function getPostVersions(
  postId: string,
): Promise<PostVersionData[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  const validated = idSchema.safeParse(postId);
  if (!validated.success) {
    return [];
  }

  return getPostVersionsQuery(validated.data);
}

export async function getPostCategories(): Promise<PostCategoryData[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getPostCategoriesQuery();
}

export async function getPostCategoryById(
  id: string,
): Promise<PostCategoryData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getPostCategoryByIdQuery(validated.data);
}

export async function getPostTags(): Promise<PostTagData[]> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getPostTagsQuery();
}

export async function getPostTagById(id: string): Promise<PostTagData | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getPostTagByIdQuery(validated.data);
}
