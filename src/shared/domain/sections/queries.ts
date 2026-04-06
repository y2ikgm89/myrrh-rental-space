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
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import { parseStringArray } from "@/shared/lib/json-validators";
import { toPlainArray } from "@/shared/lib/serialize";
import {
  idParamSchema,
  slugParamSchema,
} from "@/shared/lib/validations/params";
import { getPublicPage } from "@/shared/domain/pages/queries";

export type PublicSection = {
  readonly id: string;
  readonly type: string;
  readonly title: string | null;
  readonly contentHtml: string | null;
  readonly contentJson: unknown | null;
  readonly config: unknown;
  readonly design: unknown;
  readonly order: number;
};

function getDefaultSections(slug: string): PublicSection[] {
  const defaults = DEFAULT_PAGE_SECTIONS[slug];
  if (!defaults || defaults.length === 0) {
    return [];
  }

  return defaults.map((section, index) => ({
    id: `default-${slug}-${index}`,
    type: section.type,
    title: section.title,
    contentHtml: section.content,
    contentJson: null,
    config: section.config,
    design: section.design ?? {},
    order: section.order,
  }));
}

export async function getHomepageSections(): Promise<readonly PublicSection[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SECTIONS, CACHE_TAGS.HOMEPAGE_SECTIONS);

  const homePage = await safeFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: { slug: "home" },
        select: { id: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getHomepageSections.findPage",
  });

  if (!homePage) {
    return getDefaultSections("home");
  }

  const sections = await safeFetch({
    fetch: () =>
      prisma.section.findMany({
        where: {
          pageId: homePage.id,
          isActive: true,
        },
        select: {
          id: true,
          type: true,
          title: true,
          contentHtml: true,
          contentJson: true,
          config: true,
          design: true,
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
          dailyPrice: true,
          area: true,
          mainImageUrl: true,
          imageUrls: true,
          facilities: true,
          addressDetail: true,
          category: { select: { id: true, name: true } },
          location: { select: { name: true, address: true } },
        },
        orderBy: { createdAt: "desc" },
        take: maxItems,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getShowcaseSpaces",
  });

  return toPlainArray(
    spaces.map((s) => ({
      ...s,
      hourlyPrice: Number(s.hourlyPrice),
      dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
      area: s.area ? Number(s.area) : null,
      imageUrls: parseStringArray(s.imageUrls),
      facilities: parseStringArray(s.facilities),
      lineAddress: formatSpaceLineAddress(s.location.address, s.addressDetail),
    })),
  );
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
          type: true,
          title: true,
          contentHtml: true,
          contentJson: true,
          config: true,
          design: true,
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
