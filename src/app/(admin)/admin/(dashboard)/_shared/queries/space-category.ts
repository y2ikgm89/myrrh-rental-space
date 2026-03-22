import "server-only";

import {
  getActiveSpaceCategories as getActiveSpaceCategoriesQuery,
  getSpaceCategories as getSpaceCategoriesQuery,
  getSpaceCategoryById as getSpaceCategoryByIdQuery,
} from "@/shared/domain/space-categories/queries";
import type {
  GetSpaceCategoriesResult,
  SpaceCategoryWithStats,
} from "@/shared/lib/validations/space-category";
import { requireAdminPermission } from "./_helpers";

export async function getSpaceCategories(options: {
  includeInactive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<GetSpaceCategoriesResult> {
  await requireAdminPermission("spaceCategory", "read");
  return getSpaceCategoriesQuery(options);
}

export async function getSpaceCategoryById(
  id: string,
): Promise<SpaceCategoryWithStats | null> {
  await requireAdminPermission("spaceCategory", "read");
  return getSpaceCategoryByIdQuery(id);
}

export async function getActiveSpaceCategories(): Promise<
  { id: string; name: string; icon: string | null; color: string | null }[]
> {
  await requireAdminPermission("spaceCategory", "read");
  return getActiveSpaceCategoriesQuery();
}
