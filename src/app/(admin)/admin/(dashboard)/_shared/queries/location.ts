import "server-only";

import {
  getActiveLocationsForSelect as getActiveLocationsForSelectQuery,
  getLocationById as getLocationByIdQuery,
  getLocations as getLocationsQuery,
  getPublishedLocations as getPublishedLocationsQuery,
} from "@/shared/domain/locations/queries";
import type {
  GetLocationsResult,
  LocationWithStats,
  PublishedLocationOption,
} from "@/shared/domain/locations/types";
import { requireAdminPermission } from "./_helpers";

export async function getLocations(options?: {
  includeInactive?: boolean;
  search?: string;
}): Promise<GetLocationsResult> {
  await requireAdminPermission("location", "read");
  return getLocationsQuery(options);
}

export async function getLocationById(
  id: string,
): Promise<LocationWithStats | null> {
  await requireAdminPermission("location", "read");
  return getLocationByIdQuery(id);
}

export async function getPublishedLocations(): Promise<
  PublishedLocationOption[]
> {
  await requireAdminPermission("location", "read");
  return getPublishedLocationsQuery();
}

export async function getActiveLocationsForSelect(): Promise<
  PublishedLocationOption[]
> {
  await requireAdminPermission("location", "read");
  return getActiveLocationsForSelectQuery();
}
