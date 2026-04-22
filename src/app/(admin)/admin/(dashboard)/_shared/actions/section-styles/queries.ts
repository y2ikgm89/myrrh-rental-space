"use server";

import { checkAdminAuth } from "@/admin/lib/action-auth";
import { hasPermission } from "@/admin/lib/permissions";
import {
  getSectionStyleById,
  getSectionStyleUsage,
  listSectionStyles,
  type SectionStyleDetail,
  type SectionStyleListFilters,
  type SectionStyleListItem,
  type SectionStyleUsage,
} from "@/shared/domain/section-styles/queries";

export async function getSectionStyleList(
  filters: SectionStyleListFilters = {},
): Promise<SectionStyleListItem[]> {
  const auth = await checkAdminAuth();
  if (!auth.success) return [];
  if (!hasPermission(auth.user.role, "sectionStyle", "read")) return [];
  return listSectionStyles(filters);
}

export async function getSectionStyleDetail(
  id: string,
): Promise<SectionStyleDetail | null> {
  const auth = await checkAdminAuth();
  if (!auth.success) return null;
  if (!hasPermission(auth.user.role, "sectionStyle", "read")) return null;
  return getSectionStyleById(id);
}

export async function getSectionStyleUsageData(
  id: string,
): Promise<SectionStyleUsage> {
  const auth = await checkAdminAuth();
  if (!auth.success) return { sections: [], pages: [], settings: [] };
  if (!hasPermission(auth.user.role, "sectionStyle", "read")) {
    return { sections: [], pages: [], settings: [] };
  }
  return getSectionStyleUsage(id);
}
