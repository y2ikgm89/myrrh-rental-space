"use server";

import { z } from "zod";
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
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  type CreateSectionInput,
  type UpdateSectionInput,
  type UpdateSectionOrderInput,
} from "@/shared/lib/validations/section";
import type { PageSectionData } from "./page-section-types";

const idSchema = z.string().uuid({ error: "IDが不正です" });

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
    ...(parsed.data.pageId != null && { resourceId: parsed.data.pageId }),
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
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

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
    resourceId: parsedId.data,
    execute: async () => {
      const result = await updatePageSectionCommand(
        parsedId.data,
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
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: parsed.data,
    execute: async () => {
      const result = await togglePageSectionCommand(parsed.data, isActive);
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
  const parsedId = idSchema.safeParse(pageId);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsed = updateSectionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: parsedId.data,
    execute: async () => {
      await updatePageSectionOrderCommand(parsedId.data, parsed.data);
      return null;
    },
    afterSuccess: () => {
      revalidatePages(parsedId.data);
    },
  });
}

export async function deletePageSection(id: string): Promise<MutationResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: parsed.data,
    execute: async () => {
      const result = await deletePageSectionCommand(parsed.data);
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
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  let duplicatedPageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: parsed.data,
    execute: async () => {
      const result = await duplicatePageSectionCommand(parsed.data);
      duplicatedPageId = result.pageId ?? "";
      return result.section;
    },
    afterSuccess: () => {
      revalidatePages(duplicatedPageId);
    },
    resolveAuditResourceId: (result) => result.id,
  });
}
