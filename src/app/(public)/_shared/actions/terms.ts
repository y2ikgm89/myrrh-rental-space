/**
 * 公開規約データ取得
 *
 * 'use cache' + cacheTag で Next.js 16 キャッシュ管理
 */

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/lib/prisma";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import { TermsStatus } from "@/shared/generated/prisma/enums";
import { slugParamSchema } from "@/shared/lib/validations/params";
import { toPlainObject } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

const publicTermsSelect = {
  id: true,
  title: true,
  slug: true,
  type: true,
  versions: {
    where: {
      isCurrentVersion: true,
      status: TermsStatus.PUBLISHED,
    },
    take: 1,
    select: {
      id: true,
      version: true,
      contentHtml: true,
      publishedAt: true,
    },
  },
} as const;

export type PublicTermsData = {
  id: string;
  title: string;
  slug: string;
  type: string;
  currentVersion: {
    id: string;
    version: number;
    contentHtml: string;
    publishedAt: Date | null;
  } | null;
};

// =============================================================================
// Queries
// =============================================================================

/**
 * スラッグで公開規約を取得（公開ページ用）
 *
 * isCurrentVersion=true かつ status=PUBLISHED のバージョンを返す。
 * 存在しない場合は null を返す。
 */
export async function getPublicTermsBySlug(
  slug: string,
): Promise<PublicTermsData | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.TERMS);

  const validated = slugParamSchema.safeParse(slug);
  if (!validated.success) return null;

  const result = await safeFetch({
    fetch: () =>
      prisma.terms.findUnique({
        where: { slug: validated.data, isActive: true },
        select: publicTermsSelect,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    operationName: "getPublicTermsBySlug",
  });

  if (!result) return null;

  const currentVersion = result.versions[0] ?? null;

  return toPlainObject({
    id: result.id,
    title: result.title,
    slug: result.slug,
    type: result.type,
    currentVersion: currentVersion
      ? {
          id: currentVersion.id,
          version: currentVersion.version,
          contentHtml: currentVersion.contentHtml,
          publishedAt: currentVersion.publishedAt,
        }
      : null,
  });
}
