import "server-only";

import {
  mediaFiltersSchema,
  mediaPaginationSchema,
  type MediaFilters,
  type MediaPagination,
} from "@/admin/lib/validations/media";
import type { GetMediaResult, MediaData } from "@/admin/types/media-picker";
import {
  getMediaByIdQuery,
  getMediaListQuery,
} from "@/shared/domain/media/queries";
import { omitUndefined } from "@/shared/lib/serialize";
import { requireAdminPermission } from "./_helpers";

export async function getMediaList(
  filters: MediaFilters = {},
  pagination: MediaPagination = { page: 1, limit: 24 },
): Promise<GetMediaResult> {
  await requireAdminPermission("media", "read");

  const validatedFilters = mediaFiltersSchema.safeParse(filters);
  if (!validatedFilters.success) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 };
  }

  const validatedPagination = mediaPaginationSchema.safeParse(pagination);
  if (!validatedPagination.success) {
    return { items: [], total: 0, page: 1, limit: 24, totalPages: 0 };
  }

  return getMediaListQuery(
    omitUndefined(validatedFilters.data),
    validatedPagination.data,
  );
}

export async function getMediaById(id: string): Promise<MediaData | null> {
  await requireAdminPermission("media", "read");
  return getMediaByIdQuery(id);
}
