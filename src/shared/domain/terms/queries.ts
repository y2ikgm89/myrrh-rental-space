import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { TermsStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import { slugParamSchema } from "@/shared/lib/validations/params";

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
      contentJson: true,
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
    /** Lexical EditorState JSON — 管理画面エディタ復元用（公開側の目次は contentHtml 駆動） */
    contentJson: unknown;
    publishedAt: Date | null;
  } | null;
};

export async function getPublicTermsBySlug(
  slug: string,
): Promise<Serialized<PublicTermsData> | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.TERMS);

  const validated = slugParamSchema.safeParse(slug);
  if (!validated.success) {
    return null;
  }

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

  if (!result) {
    return null;
  }

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
          contentJson: currentVersion.contentJson,
          publishedAt: currentVersion.publishedAt,
        }
      : null,
  });
}
