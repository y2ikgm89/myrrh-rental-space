import "server-only";

import {
  getHomepageSectionByTypeQuery,
  getHomepageSectionQuery,
  getHomepageSectionsQuery,
  getPublicHomepageSectionsQuery,
} from "@/shared/domain/sections/admin-queries";
import {
  SectionType,
  type SectionConfig,
} from "@/shared/lib/validations/section";
import { requireAdminPermission } from "./_helpers";

export type HomepageSectionData = {
  id: string;
  type: SectionType;
  title: string | null;
  config: SectionConfig;
  design: unknown;
  contentHtml: string | null;
  contentJson: unknown;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function getHomepageSections(): Promise<
  HomepageSectionData[] | null
> {
  await requireAdminPermission("settings", "read");
  return getHomepageSectionsQuery();
}

export async function getPublicHomepageSections(): Promise<
  HomepageSectionData[]
> {
  return getPublicHomepageSectionsQuery();
}

export async function getHomepageSection(
  id: string,
): Promise<HomepageSectionData | null> {
  await requireAdminPermission("settings", "read");
  return getHomepageSectionQuery(id);
}

export async function getHomepageSectionByType(
  type: SectionType,
): Promise<HomepageSectionData | null> {
  await requireAdminPermission("settings", "read");
  return getHomepageSectionByTypeQuery(type);
}
