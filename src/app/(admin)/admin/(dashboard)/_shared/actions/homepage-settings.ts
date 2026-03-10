"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { purgeHomeCache } from "@/shared/lib/cloudflare";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
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

export const createHomepageSection = async (
  input: CreateSectionInput,
): Promise<MutationResult<{ id: string }>> => {
  const parsed = createSectionSchema.safeParse({ ...input, pageId: undefined });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : null;

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => createHomepageSectionCommand(parsed.data, contentHtml),
    afterSuccess: () => {
      revalidateHomepage();
    },
    resolveAuditResourceId: (result) => result.id,
  });
};

export const updateHomepageSection = async (
  id: string,
  input: UpdateSectionInput,
): Promise<MutationResult> => {
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

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateHomepageSectionCommand(id, parsed.data, contentHtml);
      return null;
    },
    afterSuccess: () => {
      revalidateHomepage();
    },
  });
};

export const toggleHomepageSection = async (
  id: string,
  isActive: boolean,
): Promise<MutationResult> =>
  executeAdminMutationResult({
    resource: "settings",
    action: "update",
    resourceId: id,
    execute: async () => {
      await toggleHomepageSectionCommand(id, isActive);
      return null;
    },
    afterSuccess: () => {
      revalidateHomepage();
    },
  });

export const updateSectionOrder = async (
  input: UpdateSectionOrderInput,
): Promise<MutationResult> => {
  const parsed = updateSectionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateHomepageSectionOrderCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      revalidateHomepage();
    },
  });
};

export const deleteHomepageSection = async (
  id: string,
): Promise<MutationResult> =>
  executeAdminMutationResult({
    resource: "settings",
    action: "update",
    resourceId: id,
    execute: async () => {
      await deleteHomepageSectionCommand(id);
      return null;
    },
    afterSuccess: () => {
      revalidateHomepage();
    },
  });

export const initializeDefaultSections = async (): Promise<
  MutationResult<{ created: boolean }>
> => {
  let initializedDefaultSectionsCreated = false;

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      initializedDefaultSectionsCreated =
        await initializeDefaultHomepageSectionsCommand();
      return { created: initializedDefaultSectionsCreated };
    },
    afterSuccess: () => {
      revalidateHomepage();
    },
  });
};
