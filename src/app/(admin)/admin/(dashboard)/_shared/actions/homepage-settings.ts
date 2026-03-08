"use server";

import { updateTag } from "next/cache";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { createSuccess } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  createHomepageSectionCommand,
  deleteHomepageSectionCommand,
  initializeDefaultHomepageSectionsCommand,
  toggleHomepageSectionCommand,
  updateHomepageSectionCommand,
  updateHomepageSectionOrderCommand,
} from "@/shared/domain/sections/commands";
import {
  SectionType,
  createSectionSchema,
  updateSectionOrderSchema,
  updateSectionSchema,
  type CreateSectionInput,
  type SectionConfig,
  type UpdateSectionInput,
  type UpdateSectionOrderInput,
} from "@/shared/lib/validations/section";

export type HomepageSectionData = {
  id: string;
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

function revalidateHomepage() {
  updateTag(CACHE_TAGS.SECTIONS);
  updateTag(CACHE_TAGS.HOMEPAGE_SECTIONS);
  updateTag(CACHE_TAGS.PAGES);
  updateTag(CACHE_TAGS.SETTINGS);

  fireAndForget(purgeHomeCache(), {
    operation: "purgeHomeCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });
}

export const createHomepageSection = async (input: CreateSectionInput) => {
  const parsed = createSectionSchema.safeParse({ ...input, pageId: undefined });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : null;

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () =>
      createHomepageSectionCommand(parsed.data, contentHtml),
    success: (result) => createSuccess("セクションを作成しました", result),
    afterSuccess: () => {
      revalidateHomepage();
    },
    resolveAuditResourceId: (result) => result.id,
  });
};

export const updateHomepageSection = async (
  id: string,
  input: UpdateSectionInput,
) => {
  const parsed = updateSectionSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  const contentHtml =
    parsed.data.contentJson === undefined
      ? undefined
      : parsed.data.contentJson
        ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
        : null;

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    resourceId: id,
    execute: async () =>
      updateHomepageSectionCommand(id, parsed.data, contentHtml),
    success: () => createSuccess("セクションを更新しました"),
    afterSuccess: () => {
      revalidateHomepage();
    },
  });
};

export const toggleHomepageSection = async (id: string, isActive: boolean) =>
  executeAdminMutation({
    resource: "settings",
    action: "update",
    resourceId: id,
    execute: async () => toggleHomepageSectionCommand(id, isActive),
    success: () =>
      createSuccess(
        isActive
          ? "セクションを有効にしました"
          : "セクションを無効にしました",
      ),
    afterSuccess: () => {
      revalidateHomepage();
    },
  });

export const updateSectionOrder = async (input: UpdateSectionOrderInput) => {
  const parsed = updateSectionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => updateHomepageSectionOrderCommand(parsed.data),
    success: () => createSuccess("順序を更新しました"),
    afterSuccess: () => {
      revalidateHomepage();
    },
  });
};

export const deleteHomepageSection = async (id: string) =>
  executeAdminMutation({
    resource: "settings",
    action: "update",
    resourceId: id,
    execute: async () => deleteHomepageSectionCommand(id),
    success: () => createSuccess("セクションを削除しました"),
    afterSuccess: () => {
      revalidateHomepage();
    },
  });

export const initializeDefaultSections = async () =>
{
  let initializedDefaultSectionsCreated = false;

  return executeAdminMutation<void>({
    resource: "settings",
    action: "update",
    execute: async () => {
      initializedDefaultSectionsCreated =
        await initializeDefaultHomepageSectionsCommand();
    },
    success: () =>
      createSuccess(
        initializedDefaultSectionsCreated
          ? "デフォルトセクションを作成しました"
          : "既にセクションが存在します",
      ),
    afterSuccess: () => {
      revalidateHomepage();
    },
  });
};
