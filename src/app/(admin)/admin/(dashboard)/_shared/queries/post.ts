import "server-only";

import { z } from "zod";
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
import { requireAdminPermission } from "./_helpers";

const idSchema = z.string().uuid({ error: "IDが不正です" });

export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {},
): Promise<GetPostsResult> {
  await requireAdminPermission("post", "read");
  return getPostsQuery(filters, pagination);
}

export async function getPostById(id: string): Promise<PostData | null> {
  await requireAdminPermission("post", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getPostByIdQuery(validated.data);
}

export async function getPostVersions(
  postId: string,
): Promise<PostVersionData[]> {
  await requireAdminPermission("post", "read");

  const validated = idSchema.safeParse(postId);
  if (!validated.success) {
    return [];
  }

  return getPostVersionsQuery(validated.data);
}

export async function getPostCategories(): Promise<PostCategoryData[]> {
  await requireAdminPermission("post", "read");
  return getPostCategoriesQuery();
}

export async function getPostCategoryById(
  id: string,
): Promise<PostCategoryData | null> {
  await requireAdminPermission("post", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getPostCategoryByIdQuery(validated.data);
}

export async function getPostTags(): Promise<PostTagData[]> {
  await requireAdminPermission("post", "read");
  return getPostTagsQuery();
}

export async function getPostTagById(id: string): Promise<PostTagData | null> {
  await requireAdminPermission("post", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getPostTagByIdQuery(validated.data);
}
