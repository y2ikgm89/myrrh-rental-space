import "server-only";

import {
  getPostById as getPostByIdQuery,
  getPostCategories as getPostCategoriesQuery,
  getPostCategoryById as getPostCategoryByIdQuery,
  getPosts as getPostsQuery,
  getPostTagById as getPostTagByIdQuery,
  getPostTags as getPostTagsQuery,
} from "@/shared/domain/posts/admin-queries";
import type {
  GetPostsResult,
  PostCategoryData,
  PostData,
  PostFilters,
  PostPagination,
  PostTagData,
} from "@/shared/domain/posts/types";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { requireAdminPermission } from "./_helpers";

const idSchema = uuidIdSchema("記事");

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
