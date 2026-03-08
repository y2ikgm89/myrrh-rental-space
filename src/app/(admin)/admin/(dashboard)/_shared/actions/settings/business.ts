"use server";

/**
 * 事業者情報・連絡先・営業時間 Server Actions
 *
 * @module admin/actions/settings/business
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  updateBusinessHoursSettings as updateBusinessHoursSettingsCommand,
  updateBusinessInfo as updateBusinessInfoCommand,
  updateContactInfo as updateContactInfoCommand,
  updateMeoSettings as updateMeoSettingsCommand,
} from "@/shared/domain/settings/commands";

import {
  businessInfoSchema,
  contactInfoSchema,
  businessHoursSettingsSchema,
  meoSettingsSchema,
  type BusinessInfoInput,
  type ContactInfoInput,
  type BusinessHoursSettingsInput,
  type MeoSettingsInput,
} from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

function invalidateBusinessHoursCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.RESERVATIONS);
}

export async function updateBusinessInfo(
  data: BusinessInfoInput,
): Promise<ActionResult<void>> {
  const parsed = businessInfoSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateBusinessInfoCommand(parsed.data);
    },
    success: () => createSuccess("事業者情報を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateContactInfo(
  data: ContactInfoInput,
): Promise<ActionResult<void>> {
  const parsed = contactInfoSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateContactInfoCommand(parsed.data);
    },
    success: () => createSuccess("連絡先情報を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateBusinessHoursSettings(
  data: BusinessHoursSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = businessHoursSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateBusinessHoursSettingsCommand(parsed.data);
    },
    success: () => createSuccess("営業時間設定を更新しました"),
    afterSuccess: invalidateBusinessHoursCache,
  });
}

export async function updateMeoSettings(
  data: MeoSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = meoSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateMeoSettingsCommand(parsed.data);
    },
    success: () => createSuccess("MEO設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}
