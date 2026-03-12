import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { DEFAULT_PAGE_SECTIONS } from "@/shared/lib/constants/default-page-sections";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainArray } from "@/shared/lib/serialize";
import {
  idParamSchema,
  slugParamSchema,
} from "@/shared/lib/validations/params";
import { getPublicPage } from "@/shared/domain/pages/queries";

export type PublicSection = {
  readonly id: string;
  readonly componentId: string;
  readonly title: string | null;
  readonly contentHtml: string | null;
  readonly contentJson: unknown | null;
  readonly config: unknown;
  readonly design: unknown;
  readonly effectConfig: unknown;
  readonly order: number;
};

function getDefaultSections(slug: string): PublicSection[] {
  const defaults = DEFAULT_PAGE_SECTIONS[slug];
  if (!defaults || defaults.length === 0) {
    return [];
  }

  return defaults.map((section, index) => ({
    id: `default-${slug}-${index}`,
    componentId: section.componentId,
    title: section.title,
    contentHtml: section.content,
    contentJson: null,
    config: section.config,
    design: section.design ?? {},
    effectConfig: {},
    order: section.order,
  }));
}

export async function getHomepageSections(): Promise<readonly PublicSection[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SECTIONS, CACHE_TAGS.HOMEPAGE_SECTIONS);

  const sections = await safeFetch({
    fetch: () =>
      prisma.section.findMany({
        where: {
          pageId: null,
          isActive: true,
        },
        select: {
          id: true,
          componentId: true,
          title: true,
          contentHtml: true,
          contentJson: true,
          config: true,
          design: true,
          effectConfig: true,
          order: true,
        },
        orderBy: { order: "asc" },
      }),
    fallback: getDefaultSections("home"),
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getHomepageSections",
  });

  return toPlainArray(sections);
}

export async function getShowcaseSpaces(
  maxItems: number,
  showOnlyPublished: boolean,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const spaces = await safeFetch({
    fetch: () =>
      prisma.space.findMany({
        where: {
          isActive: true,
          ...(showOnlyPublished ? { isPublished: true } : {}),
        },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          capacity: true,
          hourlyPrice: true,
          area: true,
          mainImageUrl: true,
        },
        orderBy: { createdAt: "desc" },
        take: maxItems,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getShowcaseSpaces",
  });

  return toPlainArray(spaces);
}

export async function getPageSections(
  pageId: string,
): Promise<readonly PublicSection[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SECTIONS, CACHE_TAGS.PAGE_SECTIONS);

  if (!idParamSchema.safeParse(pageId).success) return [];

  const sections = await safeFetch({
    fetch: () =>
      prisma.section.findMany({
        where: {
          pageId,
          isActive: true,
        },
        select: {
          id: true,
          componentId: true,
          title: true,
          contentHtml: true,
          contentJson: true,
          config: true,
          design: true,
          effectConfig: true,
          order: true,
        },
        orderBy: { order: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPageSections",
  });

  return toPlainArray(sections);
}

export async function getPageSectionsWithFallback(
  slug: string,
): Promise<readonly PublicSection[]> {
  if (!slugParamSchema.safeParse(slug).success) return [];

  const page = await getPublicPage(slug);
  if (page) {
    const sections = await getPageSections(page.id);
    if (sections.length > 0) return sections;
  }

  return getDefaultSections(slug);
}

export async function getPublishedFaqItems(
  maxItems: number,
  categoryId?: string,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.FAQ);

  const items = await safeFetch({
    fetch: () =>
      prisma.faqItem.findMany({
        where: {
          isPublished: true,
          ...(categoryId ? { categoryId } : {}),
        },
        select: {
          id: true,
          question: true,
          answerHtml: true,
          answerJson: true,
        },
        orderBy: { order: "asc" },
        take: maxItems,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedFaqItems",
  });

  return toPlainArray(items);
}
