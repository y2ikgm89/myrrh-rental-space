import "server-only";

import {
  getHomepageSectionByComponentIdQuery,
  getHomepageSectionQuery,
  getHomepageSectionsQuery,
  getPublicHomepageSectionsQuery,
} from "@/shared/domain/sections/admin-queries";
import type { Serialized } from "@/shared/lib/serialize";
import { requireAdminPermission } from "./_helpers";

export type HomepageSectionData = {
  id: string;
  componentId: string;
  title: string | null;
  config: unknown;
  design: unknown;
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

export async function getHomepageSectionByComponentId(
  componentId: string,
): Promise<Serialized<HomepageSectionData> | null> {
  await requireAdminPermission("settings", "read");
  return getHomepageSectionByComponentIdQuery(componentId);
}
