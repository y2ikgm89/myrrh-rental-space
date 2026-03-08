import "server-only";

import { z } from "zod";
import {
  createFailure,
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import {
  getActiveSpaceCategories as getActiveSpaceCategoriesQuery,
  getSpaceCategories as getSpaceCategoriesQuery,
  getSpaceCategoryById as getSpaceCategoryByIdQuery,
} from "@/shared/domain/space-categories/queries";
import type {
  GetSpaceCategoriesResult,
  SpaceCategoryWithStats,
} from "@/admin/lib/validations/space-category";
import { requireAdminPermission } from "./_helpers";

const idSchema = z.string().uuid({ error: "カテゴリーIDが不正です" });

export async function getSpaceCategories(options?: {
  includeInactive?: boolean;
  search?: string;
}): Promise<GetSpaceCategoriesResult> {
  await requireAdminPermission("spaceCategory", "read");
  return getSpaceCategoriesQuery(options);
}

export async function getSpaceCategoryById(
  id: string,
): Promise<ActionResult<SpaceCategoryWithStats>> {
  await requireAdminPermission("spaceCategory", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const category = await getSpaceCategoryByIdQuery(validated.data);
  if (!category) {
    return createFailure("カテゴリーが見つかりません");
  }

  return createSuccess("取得しました", category);
}

export async function getActiveSpaceCategories(): Promise<
  ActionResult<{ id: string; name: string; icon: string | null; color: string | null }[]>
> {
  await requireAdminPermission("spaceCategory", "read");
  const categories = await getActiveSpaceCategoriesQuery();
  return createSuccess("取得しました", categories);
}
