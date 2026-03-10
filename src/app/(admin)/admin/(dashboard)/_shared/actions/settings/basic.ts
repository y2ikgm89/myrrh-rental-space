"use server";

/**
 * 基本情報・レイアウト・SEO設定 Server Actions
 *
 * @module admin/actions/settings/basic
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  executeAdminMutationResult,
} from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result"
import {
  updateBasicInfo as updateBasicInfoCommand,
  updateLayoutSettings as updateLayoutSettingsCommand,
  updateSeoSettings as updateSeoSettingsCommand,
} from "@/shared/domain/settings/commands";

import {
  basicInfoSchema,
  layoutSettingsSchema,
  seoSettingsSchema,
  type BasicInfoInput,
  type LayoutSettingsInput,
  type SeoSettingsInput,
} from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function updateBasicInfo(
  data: BasicInfoInput,
): Promise<MutationResult> {
  const parsed = basicInfoSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateBasicInfoCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateLayoutSettings(
  data: LayoutSettingsInput,
): Promise<MutationResult> {
  const parsed = layoutSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateLayoutSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateSeoSettings(
  data: SeoSettingsInput,
): Promise<MutationResult> {
  const parsed = seoSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateSeoSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}
