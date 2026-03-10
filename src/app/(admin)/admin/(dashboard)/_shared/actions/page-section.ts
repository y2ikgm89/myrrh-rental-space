"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createPageSectionCommand,
  deletePageSectionCommand,
  duplicatePageSectionCommand,
  togglePageSectionCommand,
  updatePageSectionCommand,
  updatePageSectionOrderCommand,
} from "@/shared/domain/sections/commands";
import {
  type SectionType,
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  type CreateSectionInput,
  type UpdateSectionInput,
  type UpdateSectionOrderInput,
  type SectionConfig,
} from "@/shared/lib/validations/section";

export type PageSectionData = {
  id: string;
  pageId: string;
  type: SectionType;
  title: string | null;
  config: SectionConfig;
  design: unknown;
  contentHtml: string | null;
  contentJson: unknown;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PageWithSections = {
  id: string;
  slug: string;
  title: string;
  sections: PageSectionData[];
};

export type PageForEdit = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  isSystem: boolean;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
  sections: PageSectionData[];
};

function revalidatePages(pageId?: string) {
  updateTag(CACHE_TAGS.SECTIONS);
  updateTag(CACHE_TAGS.PAGE_SECTIONS);
  updateTag(CACHE_TAGS.PAGES);
  if (pageId) {
    updateTag(getCacheTag.pages.detail(pageId));
  }
}

export async function createPageSection(
  input: CreateSectionInput,
): Promise<
  MutationResult<Awaited<ReturnType<typeof createPageSectionCommand>>>
> {
  const parsed = createSectionSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : null;

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: parsed.data.pageId,
    execute: async () => createPageSectionCommand(parsed.data, contentHtml),
    afterSuccess: () => {
      if (parsed.data.pageId) {
        revalidatePages(parsed.data.pageId);
      }
    },
    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePageSection(
  id: string,
  input: UpdateSectionInput,
): Promise<MutationResult> {
  const parsed = updateSectionSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml =
    parsed.data.contentJson === undefined
      ? undefined
      : parsed.data.contentJson
        ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
        : null;

  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,
    execute: async () => {
      const result = await updatePageSectionCommand(
        id,
        parsed.data,
        contentHtml,
      );
      pageId = result.pageId;
      return null;
    },
    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function togglePageSection(
  id: string,
  isActive: boolean,
): Promise<MutationResult> {
  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,
    execute: async () => {
      const result = await togglePageSectionCommand(id, isActive);
      pageId = result.pageId;
      return null;
    },
    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function updatePageSectionOrder(
  pageId: string,
  input: UpdateSectionOrderInput,
): Promise<MutationResult> {
  const parsed = updateSectionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: pageId,
    execute: async () => {
      await updatePageSectionOrderCommand(pageId, parsed.data);
      return null;
    },
    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function deletePageSection(id: string): Promise<MutationResult> {
  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,
    execute: async () => {
      const result = await deletePageSectionCommand(id);
      pageId = result.pageId;
      return null;
    },
    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function duplicatePageSection(
  id: string,
): Promise<MutationResult<PageSectionData>> {
  let duplicatedPageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,
    execute: async () => {
      const result = await duplicatePageSectionCommand(id);
      duplicatedPageId = result.pageId ?? "";
      return result.section;
    },
    afterSuccess: () => {
      revalidatePages(duplicatedPageId);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}
