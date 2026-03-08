import "server-only";

import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  getSpaceByIdQuery,
  getSpacesForSelectQuery,
  getSpaceStatsQuery,
  getSpacesQuery,
} from "@/shared/domain/spaces/queries";
import {
  type GetSpacesResult,
  type SpaceFilters,
  type SpacePagination,
  type SpaceWithStats,
} from "@/admin/lib/validations/space";
import { requireAdminPermission } from "./_helpers";

export type SpaceSelectOption = {
  id: string;
  slug: string;
  name: string;
  mainImageUrl: string;
  hourlyPrice: string;
  capacity: number;
};

export async function getSpaces(
  filters: SpaceFilters = {},
  pagination: SpacePagination = {},
): Promise<GetSpacesResult> {
  await requireAdminPermission("space", "read");
  return getSpacesQuery(filters, pagination);
}

export async function getSpaceById(id: string): Promise<SpaceWithStats | null> {
  await requireAdminPermission("space", "read");
  return getSpaceByIdQuery(id);
}

export async function getSpaceStats(): Promise<{
  total: number;
  published: number;
  unpublished: number;
  totalCapacity: number;
}> {
  await requireAdminPermission("space", "read");
  return getSpaceStatsQuery();
}

export async function getSpacesForSelect(): Promise<
  ActionResult<SpaceSelectOption[]>
> {
  await requireAdminPermission("space", "read");
  const spaces = await getSpacesForSelectQuery();
  return createSuccess("取得しました", spaces);
}
