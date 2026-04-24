"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgePageCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { getMediaByIdsQuery } from "@/shared/domain/media/queries";
import { DomainError } from "@/shared/domain/domain-error";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  publishPageBuilderCommand,
  restorePageBuilderRevisionCommand,
  savePageBuilderDraftCommand,
  unpublishPageBuilderCommand,
} from "@/shared/domain/page-builder/commands";
import {
  getPageBuilderForEditQuery,
  getPageBuilderRevisionSummariesQuery,
} from "@/shared/domain/page-builder/queries";
import type { PageBuilderRevisionSummary } from "@/shared/domain/page-builder/types";
import {
  collectPageBuilderImageMediaIds,
  createPageBuilderResolvedMediaMap,
  type PageBuilderResolvedMediaMap,
} from "@/shared/lib/page-builder/media";
import {
  pageBuilderDocumentSchema,
  type PageBuilderDocument,
} from "@/shared/lib/page-builder/schema";

function invalidatePageBuilderTags(slug: string): void {
  updateTag(CACHE_TAGS.PAGES);
  updateTag(CACHE_TAGS.PAGE_BUILDERS);
  updateTag(getCacheTag.pages.detail(slug));
  updateTag(getCacheTag.pageBuilders.detail(slug));
}

function purgePageCaches(slug: string): void {
  fireAndForget(purgePageCache(slug), {
    operation: "purgePageCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

function parseBuilderDocument(
  input: unknown,
): MutationResult<PageBuilderDocument> {
  const parsed = pageBuilderDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return parsed.data;
}

type RestorePageBuilderRevisionResult = {
  draftVersion: number;
  updatedAt: Date;
  document: PageBuilderDocument;
  media: PageBuilderResolvedMediaMap;
  revisions: PageBuilderRevisionSummary[];
  restoredFrom: PageBuilderRevisionSummary;
};

type ReloadPageBuilderStateResult = {
  draftVersion: number;
  publishedVersion: number | null;
  isPublished: boolean;
  publishedAt: Date | string | null;
  lastPublishedAt: Date | string | null;
  updatedAt: Date | string;
  document: PageBuilderDocument;
  media: PageBuilderResolvedMediaMap;
  revisions: PageBuilderRevisionSummary[];
};

function createReloadPageBuilderStateResult(
  page: NonNullable<Awaited<ReturnType<typeof getPageBuilderForEditQuery>>>,
): ReloadPageBuilderStateResult {
  return {
    draftVersion: page.draftVersion,
    publishedVersion: page.publishedVersion,
    isPublished: page.isPublished,
    publishedAt: page.publishedAt,
    lastPublishedAt: page.lastPublishedAt,
    updatedAt: page.updatedAt,
    document: page.draftDocument,
    media: page.media,
    revisions: page.revisions,
  };
}

export async function savePageBuilderDraft(
  pageId: string,
  slug: string,
  expectedDraftVersion: number,
  input: unknown,
): Promise<
  MutationResult<{
    draftVersion: number;
    updatedAt: Date;
    revisions: PageBuilderRevisionSummary[];
  }>
> {
  const parsed = parseBuilderDocument(input);
  if ("error" in parsed) {
    return parsed;
  }

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: slug,
    execute: async (user) => {
      const saved = await savePageBuilderDraftCommand(
        pageId,
        parsed,
        expectedDraftVersion,
        user.id,
      );
      const revisions = await getPageBuilderRevisionSummariesQuery(pageId);

      return {
        draftVersion: saved.draftVersion,
        updatedAt: saved.updatedAt,
        revisions,
      };
    },
    afterSuccess: () => {
      invalidatePageBuilderTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function publishPageBuilder(
  pageId: string,
  slug: string,
  expectedDraftVersion: number,
  input: unknown,
): Promise<
  MutationResult<{
    draftVersion: number;
    publishedVersion: number;
    publishedAt: Date;
    lastPublishedAt: Date;
    revisions: PageBuilderRevisionSummary[];
  }>
> {
  const parsed = parseBuilderDocument(input);
  if ("error" in parsed) {
    return parsed;
  }

  return executeAdminMutationResult({
    resource: "page",
    action: "publish",
    resourceId: slug,
    execute: async (user) => {
      const published = await publishPageBuilderCommand(
        pageId,
        parsed,
        expectedDraftVersion,
        user.id,
      );
      const revisions = await getPageBuilderRevisionSummariesQuery(pageId);

      return {
        draftVersion: published.draftVersion,
        publishedVersion: published.publishedVersion,
        publishedAt: published.publishedAt,
        lastPublishedAt: published.lastPublishedAt,
        revisions,
      };
    },
    afterSuccess: () => {
      invalidatePageBuilderTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function unpublishPageBuilder(
  pageId: string,
  slug: string,
): Promise<MutationResult<{ isPublished: false }>> {
  return executeAdminMutationResult({
    resource: "page",
    action: "publish",
    resourceId: slug,
    execute: async () => unpublishPageBuilderCommand(pageId),
    afterSuccess: () => {
      invalidatePageBuilderTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function restorePageBuilderRevision(
  pageId: string,
  slug: string,
  revisionId: string,
  expectedDraftVersion: number,
): Promise<MutationResult<RestorePageBuilderRevisionResult>> {
  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: slug,
    execute: async (user) => {
      const restored = await restorePageBuilderRevisionCommand(
        pageId,
        revisionId,
        expectedDraftVersion,
        user.id,
      );
      const mediaIds = collectPageBuilderImageMediaIds(restored.document);
      const [mediaItems, revisions] = await Promise.all([
        getMediaByIdsQuery(mediaIds),
        getPageBuilderRevisionSummariesQuery(pageId),
      ]);

      return {
        draftVersion: restored.draftVersion,
        updatedAt: restored.updatedAt,
        document: restored.document,
        media: createPageBuilderResolvedMediaMap(mediaItems),
        revisions,
        restoredFrom: restored.restoredFrom,
      };
    },
    afterSuccess: () => {
      invalidatePageBuilderTags(slug);
      purgePageCaches(slug);
    },
  });
}

export async function reloadPageBuilderState(
  pageId: string,
  slug: string,
): Promise<MutationResult<ReloadPageBuilderStateResult>> {
  return executeAdminMutationResult({
    resource: "page",
    action: "read",
    resourceId: slug,
    execute: async () => {
      const page = await getPageBuilderForEditQuery(slug);
      if (!page || page.id !== pageId) {
        throw new DomainError(
          "ページビルダーの状態が見つかりません",
          "NOT_FOUND",
        );
      }

      return createReloadPageBuilderStateResult(page);
    },
  });
}
