import "server-only";

import {
  getActiveEventCategories as getActiveEventCategoriesQuery,
  getEventCategories as getEventCategoriesQuery,
  getEventCategoryById as getEventCategoryByIdQuery,
} from "@/shared/domain/event-categories/queries";
import type {
  GetEventCategoriesResult,
  EventCategoryWithStats,
} from "@/shared/lib/validations/event-category";
import { requireAdminPermission } from "./_helpers";

export async function getEventCategories(options: {
  includeInactive?: boolean;
  search?: string;
  page: number;
  limit: number;
}): Promise<GetEventCategoriesResult> {
  await requireAdminPermission("eventCategory", "read");
  return getEventCategoriesQuery(options);
}

export async function getEventCategoryById(
  id: string,
): Promise<EventCategoryWithStats | null> {
  await requireAdminPermission("eventCategory", "read");
  return getEventCategoryByIdQuery(id);
}

export async function getActiveEventCategories(): Promise<
  { id: string; name: string; icon: string | null; color: string | null }[]
> {
  await requireAdminPermission("eventCategory", "read");
  return getActiveEventCategoriesQuery();
}
