"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { updatePageSectionCommand } from "@/shared/domain/sections/commands";
import {
  updateSectionContentSchema,
  type UpdateSectionContentInput,
} from "@/shared/lib/validations/section";

const idSchema = z.string().uuid({ error: "IDが不正です" });

function revalidatePages(pageId?: string) {
  updateTag(CACHE_TAGS.SECTIONS);
  updateTag(CACHE_TAGS.PAGE_SECTIONS);
  updateTag(CACHE_TAGS.PAGES);
  if (pageId) {
    updateTag(getCacheTag.pages.detail(pageId));
  }
}

export async function updatePageSection(
  id: string,
  input: UpdateSectionContentInput,
): Promise<MutationResult> {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return createValidationMutationError(parsedId.error);

  const parsed = updateSectionContentSchema.safeParse(input);
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
