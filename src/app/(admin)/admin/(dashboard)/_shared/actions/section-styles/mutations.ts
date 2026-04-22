"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createSectionStyle as createSectionStyleCommand,
  deleteSectionStyle as deleteSectionStyleCommand,
  deriveSectionStyle as deriveSectionStyleCommand,
  updateSectionStyle as updateSectionStyleCommand,
} from "@/shared/domain/section-styles/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createSectionStyleInputSchema,
  deriveSectionStyleInputSchema,
  updateSectionStyleInputSchema,
  type CreateSectionStyleInput,
  type DeriveSectionStyleInput,
  type UpdateSectionStyleInput,
} from "@/shared/lib/validations/section-style";

const idSchema = z.string().min(1, { error: "Style ID が不正です" });

function invalidateStyleCaches(id?: string): void {
  updateTag(CACHE_TAGS.SECTION_STYLES);
  if (id !== undefined) {
    updateTag(getCacheTag.sectionStyles.detail(id));
  }
}

export async function createSectionStyleAction(
  input: CreateSectionStyleInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = createSectionStyleInputSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "sectionStyle",
    action: "create",
    execute: async (user) =>
      createSectionStyleCommand(parsed.data, { id: user.id, role: user.role }),
    afterSuccess: (data) => {
      invalidateStyleCaches(data.id);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function updateSectionStyleAction(
  id: string,
  input: UpdateSectionStyleInput,
): Promise<MutationResult> {
  const idValidation = idSchema.safeParse(id);
  if (!idValidation.success) {
    return createValidationMutationError(idValidation.error);
  }

  const parsed = updateSectionStyleInputSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "sectionStyle",
    action: "update",
    resourceId: idValidation.data,
    execute: async (user) => {
      await updateSectionStyleCommand(idValidation.data, parsed.data, {
        id: user.id,
        role: user.role,
      });
      return null;
    },
    afterSuccess: () => {
      invalidateStyleCaches(idValidation.data);
      // Style 変更は page / section に波及するため関連キャッシュも無効化
      updateTag(CACHE_TAGS.SECTIONS);
      updateTag(CACHE_TAGS.PAGES);
    },
  });
}

export async function deleteSectionStyleAction(
  id: string,
): Promise<MutationResult<{ affectedCount: number }>> {
  const validation = idSchema.safeParse(id);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  return executeAdminMutationResult({
    resource: "sectionStyle",
    action: "delete",
    resourceId: validation.data,
    execute: async (user) =>
      deleteSectionStyleCommand(validation.data, {
        id: user.id,
        role: user.role,
      }),
    afterSuccess: () => {
      invalidateStyleCaches(validation.data);
      // Style 削除は影響 section / page にフォールバックさせるため関連キャッシュも無効化
      updateTag(CACHE_TAGS.SECTIONS);
      updateTag(CACHE_TAGS.PAGES);
    },
  });
}

export async function deriveSectionStyleAction(
  baseId: string,
  input: DeriveSectionStyleInput,
): Promise<MutationResult<{ id: string }>> {
  const idValidation = idSchema.safeParse(baseId);
  if (!idValidation.success) {
    return createValidationMutationError(idValidation.error);
  }

  const parsed = deriveSectionStyleInputSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "sectionStyle",
    action: "create",
    execute: async (user) =>
      deriveSectionStyleCommand(idValidation.data, parsed.data, {
        id: user.id,
        role: user.role,
      }),
    afterSuccess: (data) => {
      invalidateStyleCaches(data.id);
    },
    resolveAuditResourceId: (data) => data.id,
  });
}
