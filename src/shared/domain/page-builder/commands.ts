import "server-only";

import { prisma } from "@/shared/db/prisma";
import { clonePrismaInputJson } from "@/shared/db/prisma-input-json";
import { DomainError } from "@/shared/domain/domain-error";
import type { PageBuilderDocument } from "@/shared/lib/page-builder/schema";
import { parsePageBuilderDocument } from "@/shared/lib/page-builder/schema";
import {
  coercePageBuilderRevisionKind,
  type PageBuilderRevisionSummary,
} from "./types";

async function ensureFreeformPageExists(pageId: string) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    select: { id: true },
  });

  if (!page) {
    throw new DomainError("ページが見つかりません", "NOT_FOUND");
  }

  return page;
}

function assertExpectedDraftVersion(
  actualDraftVersion: number,
  expectedDraftVersion: number,
): void {
  if (actualDraftVersion !== expectedDraftVersion) {
    throw new DomainError(
      "この下書きは別のタブまたは別の編集セッションで更新されました。最新の状態を読み込んでください。",
      "CONFLICT",
    );
  }
}

export async function savePageBuilderDraftCommand(
  pageId: string,
  document: PageBuilderDocument,
  expectedDraftVersion: number,
  createdById?: string,
): Promise<{ draftVersion: number; updatedAt: Date }> {
  const validated = parsePageBuilderDocument(document);
  const revisionDocument = clonePrismaInputJson(
    validated,
    "ページビルダードキュメントが不正です",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await tx.pageFreeformState.findUnique({
      where: { pageId },
      select: { draftVersion: true },
    });

    if (!existing) {
      throw new DomainError(
        "ページビルダーの状態が見つかりません",
        "NOT_FOUND",
      );
    }

    assertExpectedDraftVersion(existing.draftVersion, expectedDraftVersion);

    const nextDraftVersion = existing.draftVersion + 1;

    const updated = await tx.pageFreeformState.update({
      where: { pageId },
      data: {
        draftDocument: clonePrismaInputJson(
          validated,
          "ページビルダードキュメントが不正です",
        ),
        draftVersion: nextDraftVersion,
      },
      select: { draftVersion: true, updatedAt: true },
    });

    await tx.pageFreeformRevision.create({
      data: {
        pageId,
        version: nextDraftVersion,
        kind: "draft",
        document: revisionDocument,
        createdById: createdById ?? null,
      },
    });

    return updated;
  });
}

export async function publishPageBuilderCommand(
  pageId: string,
  document: PageBuilderDocument,
  expectedDraftVersion: number,
  createdById?: string,
): Promise<{
  draftVersion: number;
  publishedVersion: number;
  publishedAt: Date;
  lastPublishedAt: Date;
}> {
  const validated = parsePageBuilderDocument(document);
  const publishedAt = new Date();
  const revisionDocument = clonePrismaInputJson(
    validated,
    "ページビルダードキュメントが不正です",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await tx.pageFreeformState.findUnique({
      where: { pageId },
      select: {
        draftVersion: true,
        publishedVersion: true,
      },
    });

    if (!existing) {
      throw new DomainError(
        "ページビルダーの状態が見つかりません",
        "NOT_FOUND",
      );
    }

    assertExpectedDraftVersion(existing.draftVersion, expectedDraftVersion);

    const nextDraftVersion = existing.draftVersion + 1;
    const nextPublishedVersion = (existing.publishedVersion ?? 0) + 1;

    await tx.pageFreeformState.update({
      where: { pageId },
      data: {
        draftDocument: clonePrismaInputJson(
          validated,
          "ページビルダードキュメントが不正です",
        ),
        draftVersion: nextDraftVersion,
        publishedDocument: clonePrismaInputJson(
          validated,
          "ページビルダードキュメントが不正です",
        ),
        publishedVersion: nextPublishedVersion,
        lastPublishedAt: publishedAt,
      },
    });

    await tx.page.update({
      where: { id: pageId },
      data: {
        isPublished: true,
        publishedAt,
      },
    });

    await tx.pageFreeformRevision.create({
      data: {
        pageId,
        version: nextDraftVersion,
        kind: "draft",
        document: revisionDocument,
        createdById: createdById ?? null,
      },
    });

    await tx.pageFreeformRevision.create({
      data: {
        pageId,
        version: nextPublishedVersion,
        kind: "published",
        document: clonePrismaInputJson(
          validated,
          "ページビルダードキュメントが不正です",
        ),
        createdById: createdById ?? null,
      },
    });

    return {
      draftVersion: nextDraftVersion,
      publishedVersion: nextPublishedVersion,
      publishedAt,
      lastPublishedAt: publishedAt,
    };
  });
}

export async function unpublishPageBuilderCommand(
  pageId: string,
): Promise<{ isPublished: false }> {
  await ensureFreeformPageExists(pageId);

  await prisma.page.update({
    where: { id: pageId },
    data: {
      isPublished: false,
      publishedAt: null,
    },
  });

  return { isPublished: false };
}

export async function restorePageBuilderRevisionCommand(
  pageId: string,
  revisionId: string,
  expectedDraftVersion: number,
  createdById?: string,
): Promise<{
  draftVersion: number;
  updatedAt: Date;
  document: PageBuilderDocument;
  restoredFrom: PageBuilderRevisionSummary;
}> {
  return prisma.$transaction(async (tx) => {
    const [existing, revision] = await Promise.all([
      tx.pageFreeformState.findUnique({
        where: { pageId },
        select: { draftVersion: true },
      }),
      tx.pageFreeformRevision.findFirst({
        where: {
          id: revisionId,
          pageId,
        },
        select: {
          id: true,
          version: true,
          kind: true,
          createdAt: true,
          document: true,
        },
      }),
    ]);

    if (!existing) {
      throw new DomainError(
        "ページビルダーの状態が見つかりません",
        "NOT_FOUND",
      );
    }

    if (!revision) {
      throw new DomainError(
        "復元対象の revision が見つかりません",
        "NOT_FOUND",
      );
    }

    assertExpectedDraftVersion(existing.draftVersion, expectedDraftVersion);

    const document = parsePageBuilderDocument(revision.document);
    const nextDraftVersion = existing.draftVersion + 1;

    const updated = await tx.pageFreeformState.update({
      where: { pageId },
      data: {
        draftDocument: clonePrismaInputJson(
          document,
          "ページビルダードキュメントが不正です",
        ),
        draftVersion: nextDraftVersion,
      },
      select: { draftVersion: true, updatedAt: true },
    });

    await tx.pageFreeformRevision.create({
      data: {
        pageId,
        version: nextDraftVersion,
        kind: "draft",
        document: clonePrismaInputJson(
          document,
          "ページビルダードキュメントが不正です",
        ),
        createdById: createdById ?? null,
      },
    });

    return {
      draftVersion: updated.draftVersion,
      updatedAt: updated.updatedAt,
      document,
      restoredFrom: {
        id: revision.id,
        version: revision.version,
        kind: coercePageBuilderRevisionKind(revision.kind),
        createdAt: revision.createdAt,
      },
    };
  });
}
