import "server-only";

import {
  getPageForEditQuery,
  getPageSectionQuery,
  getPageSectionsQuery,
  getPageWithSectionsQuery,
  getPublicPageSectionsQuery,
} from "@/shared/domain/sections/admin-queries";
import type { SectionConfig } from "@/shared/lib/validations/section";
import {
  requireAdminPermission,
  requireAdminResourcePermission,
} from "./_helpers";

export type PageSectionData = {
  id: string;
  pageId: string;
  type: string;
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

export type PageWithSections = {
  id: string;
  slug: string;
  title: string;
  sections: PageSectionData[];
};

export type PageForEdit = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  isSystem: boolean;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
  sections: PageSectionData[];
};

export async function getPageSections(
  pageId: string,
): Promise<PageSectionData[] | null> {
  await requireAdminResourcePermission("page", "read", pageId);
  return getPageSectionsQuery(pageId);
}

export async function getPageWithSections(
  slug: string,
): Promise<PageWithSections | null> {
  await requireAdminPermission("page", "read");
  const page = await getPageWithSectionsQuery(slug);

  if (page) {
    await requireAdminResourcePermission("page", "read", page.id);
  }

  return page;
}

export async function getPageForEdit(
  slug: string,
): Promise<PageForEdit | null> {
  await requireAdminPermission("page", "read");
  const page = await getPageForEditQuery(slug);

  if (page) {
    await requireAdminResourcePermission("page", "read", page.id);
  }

  return page;
}

export async function getPublicPageSections(
  pageId: string,
): Promise<PageSectionData[]> {
  return getPublicPageSectionsQuery(pageId);
}

export async function getPageSection(
  id: string,
): Promise<PageSectionData | null> {
  await requireAdminPermission("page", "read");
  const section = await getPageSectionQuery(id);

  if (section) {
    await requireAdminResourcePermission("page", "read", section.pageId);
  }

  return section;
}
