import "server-only";

import {
  getHomepageSectionByTypeQuery,
  getHomepageSectionQuery,
  getHomepageSectionsQuery,
  getPublicHomepageSectionsQuery,
} from "@/shared/domain/sections/admin-queries";
import type { Serialized } from "@/shared/lib/serialize";
import type { SectionConfig } from "@/shared/lib/validations/section";
import { requireAdminPermission } from "./_helpers";

export type HomepageSectionData = {
  id: string;
  type: string;
  title: string | null;
  config: SectionConfig;
  contentHtml: string | null;
  contentJson: unknown;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function getHomepageSections(): Promise<
  Serialized<HomepageSectionData>[] | null
> {
  await requireAdminPermission("settings", "read");
  return getHomepageSectionsQuery();
}

export async function getPublicHomepageSections(): Promise<
  Serialized<HomepageSectionData>[]
> {
  return getPublicHomepageSectionsQuery();
}

export async function getHomepageSection(
  id: string,
): Promise<Serialized<HomepageSectionData> | null> {
  await requireAdminPermission("settings", "read");
  return getHomepageSectionQuery(id);
}

export async function getHomepageSectionByType(
  type: string,
): Promise<Serialized<HomepageSectionData> | null> {
  await requireAdminPermission("settings", "read");
  return getHomepageSectionByTypeQuery(type);
}
