import "server-only";

import {
  getSpaceByIdQuery,
  getSpacesForSelectQuery,
  getSpacesForReviewFilterQuery,
  getSpaceStatsQuery,
  getSpacesQuery,
} from "@/shared/domain/spaces/queries";
import {
  type GetSpacesResult,
  type SpaceFilters,
  type SpacePagination,
  type SpaceSelectOption,
  type SpaceWithStats,
} from "@/admin/lib/validations/space";
import { requireAdminPermission } from "./_helpers";

export type { SpaceSelectOption };

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

export async function getSpacesForSelect(): Promise<SpaceSelectOption[]> {
  await requireAdminPermission("space", "read");
  return getSpacesForSelectQuery();
}

export async function getSpacesForReviewFilter(): Promise<
  { id: string; name: string }[]
> {
  await requireAdminPermission("space", "read");
  return getSpacesForReviewFilterQuery();
}
