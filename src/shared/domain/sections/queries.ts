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
import {
  parseFacilities,
  parseStringArray,
} from "@/shared/lib/json-validators";
import { toPlainArray } from "@/shared/lib/serialize";
import {
  idParamSchema,
  slugParamSchema,
} from "@/shared/lib/validations/params";
import { getPublicPage } from "@/shared/domain/pages/queries";

export type PublicSection = {
  readonly id: string;
  readonly type: string;
  readonly config: unknown;
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
    config: section.config,
    order: section.order,
  }));
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
          descriptionPlainText: true,
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
      facilities: parseFacilities(s.facilities),
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
          config: true,
          order: true,
        },
        orderBy: { order: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPageSections",
  });

  return toPlainArray(sections) satisfies PublicSection[];
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
          deletedAt: null,
          category: { deletedAt: null, isActive: true },
          ...(categoryId ? { categoryId } : {}),
        },
        select: {
          id: true,
          question: true,
          answer: true,
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

export type PublicFaqCategoryWithItems = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly iconEmoji: string | null;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly question: string;
    readonly answer: string;
    readonly helpfulCount: number;
    readonly notHelpfulCount: number;
  }>;
};

/**
 * カテゴリグループ化された公開 FAQ を取得
 * - 非公開カテゴリ（isActive: false / deletedAt != null）は除外
 * - 空カテゴリ（公開項目が 0 件）は除外
 * - カテゴリ内の質問は order 昇順
 * - 公開 /faq ページ専用（セクションシステム経由のフラット一覧は `getPublishedFaqItems` を使用）
 */
export async function getPublishedFaqCategoriesWithItems(): Promise<
  readonly PublicFaqCategoryWithItems[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.FAQ);

  const categories = await safeFetch({
    fetch: () =>
      prisma.faqCategory.findMany({
        where: {
          isActive: true,
          deletedAt: null,
        },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          iconEmoji: true,
          items: {
            where: {
              isPublished: true,
              deletedAt: null,
            },
            select: {
              id: true,
              question: true,
              answer: true,
              helpfulCount: true,
              notHelpfulCount: true,
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedFaqCategoriesWithItems",
  });

  // 空カテゴリを除外し、プレーンオブジェクト化
  const filtered = categories.filter((c) => c.items.length > 0);
  return toPlainArray(filtered);
}
