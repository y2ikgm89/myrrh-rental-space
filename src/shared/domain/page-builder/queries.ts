import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  collectPageBuilderImageMediaIds,
  createPageBuilderResolvedMediaMap,
} from "@/shared/lib/page-builder/media";
import { toPlainObject } from "@/shared/lib/serialize";
import { parsePageBuilderDocument } from "@/shared/lib/page-builder/schema";
import { getMediaByIdsQuery } from "@/shared/domain/media/queries";
import type {
  PageBuilderForEdit,
  PageBuilderRevisionSummary,
  PublishedPageBuilder,
} from "./types";
import { coercePageBuilderRevisionKind } from "./types";

const PAGE_BUILDER_REVISION_LIST_LIMIT = 20;

export async function getPageBuilderRevisionSummariesQuery(
  pageId: string,
  limit = PAGE_BUILDER_REVISION_LIST_LIMIT,
): Promise<PageBuilderRevisionSummary[]> {
  const revisions = await prisma.pageFreeformRevision.findMany({
    where: { pageId },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    take: limit,
    select: {
      id: true,
      version: true,
      kind: true,
      createdAt: true,
    },
  });

  return toPlainObject(
    revisions.map((revision) => ({
      id: revision.id,
      version: revision.version,
      kind: coercePageBuilderRevisionKind(revision.kind),
      createdAt: revision.createdAt,
    })),
  ) satisfies PageBuilderRevisionSummary[];
}

export async function getPageBuilderForEditQuery(
  slug: string,
): Promise<PageBuilderForEdit | null> {
  const page = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isPublished: true,
      publishedAt: true,
      isSystemPage: true,
      freeformState: {
        select: {
          draftDocument: true,
          publishedDocument: true,
          draftVersion: true,
          publishedVersion: true,
          lastPublishedAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!page || page.isSystemPage || !page.freeformState) {
    return null;
  }

  const draftDocument = parsePageBuilderDocument(
    page.freeformState.draftDocument,
  );
  const publishedDocument = page.freeformState.publishedDocument
    ? parsePageBuilderDocument(page.freeformState.publishedDocument)
    : null;
  const mediaIds = new Set(collectPageBuilderImageMediaIds(draftDocument));
  for (const mediaId of publishedDocument
    ? collectPageBuilderImageMediaIds(publishedDocument)
    : []) {
    mediaIds.add(mediaId);
  }
  const [mediaItems, revisions] = await Promise.all([
    getMediaByIdsQuery([...mediaIds]),
    getPageBuilderRevisionSummariesQuery(page.id),
  ]);
  const media = createPageBuilderResolvedMediaMap(mediaItems);

  return toPlainObject({
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    media,
    isPublished: page.isPublished,
    publishedAt: page.publishedAt,
    draftDocument,
    publishedDocument,
    draftVersion: page.freeformState.draftVersion,
    publishedVersion: page.freeformState.publishedVersion,
    lastPublishedAt: page.freeformState.lastPublishedAt,
    updatedAt: page.freeformState.updatedAt,
    revisions,
  }) satisfies PageBuilderForEdit;
}

export async function getPublishedPageBuilderBySlugQuery(
  slug: string,
): Promise<PublishedPageBuilder | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(
    CACHE_TAGS.PAGES,
    CACHE_TAGS.PAGE_BUILDERS,
    getCacheTag.pages.detail(slug),
    getCacheTag.pageBuilders.detail(slug),
  );

  const page = await prisma.page.findUnique({
    where: {
      slug,
      isActive: true,
      isPublished: true,
    },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      isSystemPage: true,
      freeformState: {
        select: {
          publishedDocument: true,
        },
      },
    },
  });

  if (!page || page.isSystemPage || !page.freeformState?.publishedDocument) {
    return null;
  }

  const document = parsePageBuilderDocument(
    page.freeformState.publishedDocument,
  );
  const mediaIds = collectPageBuilderImageMediaIds(document);
  if (mediaIds.length > 0) {
    cacheTag(
      CACHE_TAGS.MEDIA,
      ...mediaIds.map((mediaId) => getCacheTag.media.detail(mediaId)),
    );
  }
  const media = createPageBuilderResolvedMediaMap(
    await getMediaByIdsQuery(mediaIds),
  );

  return toPlainObject({
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    media,
    document,
  }) satisfies PublishedPageBuilder;
}
