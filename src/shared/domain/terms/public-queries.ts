import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { TermsStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainArray } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReservationTermsSummary = {
  id: string;
  title: string;
  slug: string;
  type: string;
  currentVersionId: string;
};

export type FooterTermsLink = {
  title: string;
  slug: string;
};

// ---------------------------------------------------------------------------
// getReservationRequiredTerms
// ---------------------------------------------------------------------------

/**
 * 予約時に同意が必要な規約一覧を取得
 *
 * 1. requiredAtReservation=true の全規約
 * 2. 指定スペースの termsId に紐づく規約
 * を統合・重複排除して返す
 */
export async function getReservationRequiredTerms(
  spaceId: string,
): Promise<Serialized<ReservationTermsSummary[]>> {
  "use cache";
  cacheLife(CACHE_LIFE.DYNAMIC_DATA);
  cacheTag(CACHE_TAGS.TERMS, getCacheTag.spaces.detail(spaceId));

  const result = await safeFetch({
    fetch: async () => {
      // Fetch globally required terms and space-linked terms in parallel
      const [globalTerms, space] = await Promise.all([
        prisma.terms.findMany({
          where: {
            requiredAtReservation: true,
            isActive: true,
            versions: {
              some: {
                isCurrentVersion: true,
                status: TermsStatus.PUBLISHED,
              },
            },
          },
          select: {
            id: true,
            title: true,
            slug: true,
            type: true,
            versions: {
              where: { isCurrentVersion: true, status: TermsStatus.PUBLISHED },
              take: 1,
              select: { id: true },
            },
          },
        }),
        prisma.space.findUnique({
          where: { id: spaceId },
          select: {
            terms: {
              select: {
                id: true,
                title: true,
                slug: true,
                type: true,
                isActive: true,
                versions: {
                  where: {
                    isCurrentVersion: true,
                    status: TermsStatus.PUBLISHED,
                  },
                  take: 1,
                  select: { id: true },
                },
              },
            },
          },
        }),
      ]);

      // Merge and deduplicate
      const termsMap = new Map<string, ReservationTermsSummary>();

      for (const t of globalTerms) {
        const version = t.versions[0];
        if (!version) continue;
        termsMap.set(t.id, {
          id: t.id,
          title: t.title,
          slug: t.slug,
          type: t.type,
          currentVersionId: version.id,
        });
      }

      // Add space-specific terms if active and has published version
      const spaceTerms = space?.terms;
      if (spaceTerms?.isActive) {
        const version = spaceTerms.versions[0];
        if (version && !termsMap.has(spaceTerms.id)) {
          termsMap.set(spaceTerms.id, {
            id: spaceTerms.id,
            title: spaceTerms.title,
            slug: spaceTerms.slug,
            type: spaceTerms.type,
            currentVersionId: version.id,
          });
        }
      }

      return [...termsMap.values()];
    },
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: "getReservationRequiredTerms",
    context: { spaceId },
  });

  return toPlainArray(result);
}

// ---------------------------------------------------------------------------
// getFooterTerms
// ---------------------------------------------------------------------------

/**
 * フッターに表示する規約リンク一覧
 */
export async function getFooterTerms(): Promise<Serialized<FooterTermsLink[]>> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.TERMS);

  const result = await safeFetch({
    fetch: () =>
      prisma.terms.findMany({
        where: { showInFooter: true, isActive: true },
        orderBy: { title: "asc" },
        select: { title: true, slug: true },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getFooterTerms",
  });

  return toPlainArray(result);
}
