import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  SectionType,
  type SectionConfig,
  validateSectionConfig,
} from "@/shared/lib/validations/section";
import { getDefaultSectionConfig } from "@/shared/lib/validations/section-defaults";

const ADMIN_SECTION_SELECT = {
  id: true,
  pageId: true,
  type: true,
  title: true,
  config: true,
  contentHtml: true,
  contentJson: true,
  order: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function parseSectionConfig(type: string, config: unknown): SectionConfig {
  const result = validateSectionConfig(type, config);
  if (result.success) {
    return result.data;
  }

  const fallback =
    getDefaultSectionConfig(type) ??
    getDefaultSectionConfig(SectionType.CUSTOM);
  if (!fallback) {
    throw new Error("セクション設定の初期化に失敗しました");
  }
  return fallback;
}

function toSectionData(section: {
  id: string;
  pageId: string | null;
  type: string;
  title: string | null;
  config: unknown;
  contentHtml: string | null;
  contentJson: unknown;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...section,
    config: parseSectionConfig(section.type, section.config),
  };
}

export async function getPageSectionsQuery(pageId: string) {
  const sections = await prisma.section.findMany({
    where: { pageId },
    select: ADMIN_SECTION_SELECT,
    orderBy: { order: "asc" },
  });

  return sections.map((section) => ({
    ...toSectionData(section),
    pageId: section.pageId ?? "",
  }));
}

export async function getPublicPageSectionsQuery(pageId: string) {
  const sections = await prisma.section.findMany({
    where: { pageId, isActive: true },
    select: ADMIN_SECTION_SELECT,
    orderBy: { order: "asc" },
  });

  return sections.map((section) => ({
    ...toSectionData(section),
    pageId: section.pageId ?? "",
  }));
}

export async function getPageWithSectionsQuery(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      sections: {
        select: ADMIN_SECTION_SELECT,
        orderBy: { order: "asc" },
      },
    },
  });

  if (!page) {
    return null;
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    sections: page.sections.map((section) => ({
      ...toSectionData(section),
      pageId: section.pageId ?? "",
    })),
  };
}

export async function getPageForEditQuery(slug: string) {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      template: true,
      isPublished: true,
      isSystemPage: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      sections: {
        select: ADMIN_SECTION_SELECT,
        orderBy: { order: "asc" },
      },
    },
  });

  if (!page) {
    return null;
  }

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    template: page.template,
    isPublished: page.isPublished,
    isSystem: page.isSystemPage,
    metaDescription: page.metaDescription,
    metaKeywords: page.metaKeywords,
    ogpTitle: page.ogpTitle,
    ogpDescription: page.ogpDescription,
    ogpImageUrl: page.ogpImageUrl,
    sections: page.sections.map((section) => ({
      ...toSectionData(section),
      pageId: section.pageId ?? "",
    })),
  };
}

export async function getPageSectionQuery(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: ADMIN_SECTION_SELECT,
  });

  if (!section || !section.pageId) {
    return null;
  }

  return {
    ...toSectionData(section),
    pageId: section.pageId,
  };
}

/** EDITOR のページ割当チェック用（権限ゲートで sectionId から pageId を解決） */
export async function getSectionPageIdQuery(
  sectionId: string,
): Promise<string | null> {
  const row = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { pageId: true },
  });
  return row?.pageId ?? null;
}
