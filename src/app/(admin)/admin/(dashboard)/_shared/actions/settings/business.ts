"use server";

/**
 * 事業者情報・連絡先・営業時間 Server Actions
 *
 * @module admin/actions/settings/business
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result"
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
): Promise<MutationResult> {
  const parsed = businessInfoSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateBusinessInfoCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateContactInfo(
  data: ContactInfoInput,
): Promise<MutationResult> {
  const parsed = contactInfoSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateContactInfoCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateBusinessHoursSettings(
  data: BusinessHoursSettingsInput,
): Promise<MutationResult> {
  const parsed = businessHoursSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateBusinessHoursSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateBusinessHoursCache,
  });
}

export async function updateMeoSettings(
  data: MeoSettingsInput,
): Promise<MutationResult> {
  const parsed = meoSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateMeoSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}
