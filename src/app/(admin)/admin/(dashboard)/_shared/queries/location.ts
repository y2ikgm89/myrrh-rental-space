import "server-only";

import { z } from "zod";
import {
  createFailure,
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import {
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

const idSchema = z.string().uuid({ error: "場所IDが不正です" });

export async function getLocations(options?: {
  includeInactive?: boolean;
  search?: string;
}): Promise<GetLocationsResult> {
  await requireAdminPermission("location", "read");
  return getLocationsQuery(options);
}

export async function getLocationById(
  id: string,
): Promise<ActionResult<LocationWithStats>> {
  await requireAdminPermission("location", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const location = await getLocationByIdQuery(validated.data);
  if (!location) {
    return createFailure("場所が見つかりません");
  }

  return createSuccess("取得しました", location);
}

export async function getPublishedLocations(): Promise<
  ActionResult<PublishedLocationOption[]>
> {
  await requireAdminPermission("location", "read");
  const locations = await getPublishedLocationsQuery();
  return createSuccess("取得しました", locations);
}
