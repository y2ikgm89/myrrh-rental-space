import "server-only";

import { prisma } from "@/shared/db/prisma";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import {
  SectionType,
  type SectionConfig,
  validateSectionConfig,
} from "@/shared/lib/validations/section";
import {
  defaultSectionConfigs,
} from "@/shared/lib/validations/section-defaults";

function parseSectionConfig(type: SectionType, config: unknown): SectionConfig {
  const result = validateSectionConfig(type, config);
  if (result.success) {
    return result.data;
  }

  return defaultSectionConfigs[type];
}

function toSectionData(section: {
  id: string;
  pageId: string | null;
  type: SectionType;
  title: string | null;
  config: unknown;
  design: unknown;
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

export async function getHomepageSectionsQuery() {
  const sections = await prisma.section.findMany({
    where: { pageId: null },
    select: {
      id: true,
      pageId: true,
      type: true,
      title: true,
      config: true,
      design: true,
      contentHtml: true,
      contentJson: true,
      order: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { order: "asc" },
  });

  return toPlainArray(
    sections.map((section) => ({
      ...toSectionData(section),
      pageId: undefined,
    })),
  );
}

export async function getPublicHomepageSectionsQuery() {
  const sections = await prisma.section.findMany({
    where: { pageId: null, isActive: true },
    select: {
      id: true,
      pageId: true,
      type: true,
      title: true,
      config: true,
      design: true,
      contentHtml: true,
      contentJson: true,
      order: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { order: "asc" },
  });

  return toPlainArray(
    sections.map((section) => ({
      ...toSectionData(section),
      pageId: undefined,
    })),
  );
}

export async function getHomepageSectionQuery(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
  });

  if (!section || section.pageId !== null) {
    return null;
  }

  return toPlainObject({
    ...toSectionData(section),
    pageId: undefined,
  });
}

export async function getHomepageSectionByTypeQuery(type: SectionType) {
  const section = await prisma.section.findFirst({
    where: { type, pageId: null },
    orderBy: { order: "asc" },
  });

  if (!section) {
    return null;
  }

  return toPlainObject({
    ...toSectionData(section),
    pageId: undefined,
  });
}

export async function getPageSectionsQuery(pageId: string) {
  const sections = await prisma.section.findMany({
    where: { pageId },
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
      isPublished: true,
      isSystemPage: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      sections: {
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
  });

  if (!section || !section.pageId) {
    return null;
  }

  return {
    ...toSectionData(section),
    pageId: section.pageId,
  };
}
