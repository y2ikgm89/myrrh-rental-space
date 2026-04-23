import "server-only";

import {
  getSectionStyleById,
  getSectionStyleUsage,
  listSectionStyles,
  type SectionStyleDetail,
  type SectionStyleListFilters,
  type SectionStyleListItem,
  type SectionStyleUsage,
} from "@/shared/domain/section-styles/queries";
import { omitUndefined } from "@/shared/lib/serialize";
import { sectionStyleListFiltersSchema } from "@/shared/lib/validations/section-style";
import { requireAdminPermission } from "./_helpers";

export async function getSectionStyleList(
  filters: SectionStyleListFilters = {},
): Promise<SectionStyleListItem[]> {
  await requireAdminPermission("sectionStyle", "read");

  const validatedFilters = sectionStyleListFiltersSchema.safeParse(filters);
  if (!validatedFilters.success) {
    return [];
  }

  return listSectionStyles(omitUndefined(validatedFilters.data));
}

export async function getSectionStyleDetail(
  id: string,
): Promise<SectionStyleDetail | null> {
  await requireAdminPermission("sectionStyle", "read");

  if (id.length === 0) {
    return null;
  }

  return getSectionStyleById(id);
}

export async function getSectionStyleUsageData(
  id: string,
): Promise<SectionStyleUsage> {
  await requireAdminPermission("sectionStyle", "read");

  if (id.length === 0) {
    return { sections: [], pages: [], settings: [] };
  }

  return getSectionStyleUsage(id);
}
