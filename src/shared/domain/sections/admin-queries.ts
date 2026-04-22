import "server-only";

import { prisma } from "@/shared/db/prisma";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
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
  styleId: true,
  styleOverride: true,
  style: {
    select: {
      id: true,
      name: true,
      scope: true,
      applicableTypes: true,
      spacing: true,
      background: true,
      container: true,
      typography: true,
      animation: true,
      customClass: true,
    },
  },
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
  styleId?: string | null;
  styleOverride?: unknown;
  style?: {
    id: string;
    name: string;
    scope: string;
    applicableTypes: string[];
    spacing: unknown;
    background: unknown;
    container: unknown;
    typography: unknown;
    animation: unknown;
    customClass: string | null;
  } | null;
}) {
  return {
    ...section,
    config: parseSectionConfig(section.type, section.config),
    styleId: section.styleId ?? null,
    styleOverride: section.styleOverride ?? null,
    style: section.style ?? null,
  };
}

async function getHomePageId(): Promise<string | null> {
  const homePage = await prisma.page.findUnique({
    where: { slug: "home" },
    select: { id: true },
  });
  return homePage?.id ?? null;
}

export async function getHomepageSectionsQuery() {
  const homePageId = await getHomePageId();
  if (!homePageId) return [];

  const sections = await prisma.section.findMany({
    where: { pageId: homePageId },
    select: ADMIN_SECTION_SELECT,
    orderBy: { order: "asc" },
  });

  return toPlainArray(sections.map((section) => toSectionData(section)));
}

export async function getPublicHomepageSectionsQuery() {
  const homePageId = await getHomePageId();
  if (!homePageId) return [];

  const sections = await prisma.section.findMany({
    where: { pageId: homePageId, isActive: true },
    select: ADMIN_SECTION_SELECT,
    orderBy: { order: "asc" },
  });

  return toPlainArray(sections.map((section) => toSectionData(section)));
}

export async function getHomepageSectionQuery(id: string) {
  const homePageId = await getHomePageId();
  if (!homePageId) return null;

  const section = await prisma.section.findUnique({
    where: { id },
    select: ADMIN_SECTION_SELECT,
  });

  if (!section || section.pageId !== homePageId) {
    return null;
  }

  return toPlainObject(toSectionData(section));
}

export async function getHomepageSectionByTypeQuery(type: string) {
  const homePageId = await getHomePageId();
  if (!homePageId) return null;

  const section = await prisma.section.findFirst({
    where: { type, pageId: homePageId },
    select: ADMIN_SECTION_SELECT,
    orderBy: { order: "asc" },
  });

  if (!section) {
    return null;
  }

  return toPlainObject(toSectionData(section));
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
      pageHero: true,
      isPublished: true,
      isSystemPage: true,
      metaDescription: true,
      metaKeywords: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      pageStyleId: true,
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
    pageHero: page.pageHero,
    isPublished: page.isPublished,
    isSystem: page.isSystemPage,
    metaDescription: page.metaDescription,
    metaKeywords: page.metaKeywords,
    ogpTitle: page.ogpTitle,
    ogpDescription: page.ogpDescription,
    ogpImageUrl: page.ogpImageUrl,
    pageStyleId: page.pageStyleId,
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
