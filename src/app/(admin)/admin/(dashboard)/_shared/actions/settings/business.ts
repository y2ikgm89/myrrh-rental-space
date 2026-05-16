"use server";

/**
 * 事業者情報・連絡先・営業時間 Server Actions
 *
 * @module admin/actions/settings/business
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  updateBusinessHoursSettings as updateBusinessHoursSettingsCommand,
  updateBusinessInfo as updateBusinessInfoCommand,
  updateContactInfo as updateContactInfoCommand,
} from "@/shared/domain/settings/commands";

import {
  businessInfoSchema,
  contactInfoFormSchema,
  businessHoursSettingsSchema,
  type BusinessInfoInput,
  type BusinessHoursSettingsInput,
} from "./schemas";

/**
 * `""` → `null` 変換 helper（conform `parseWithZod` 経由の FormData では
 * 空フィールドが `""` で届くため、domain command 渡し前に null 化する。
 * 共有 `emptyToNull` は client 側 helper のため server からは再定義）。
 */
function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
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
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ORGANIZATION_SETTINGS);
    },
  });
}

/**
 * 連絡先情報更新 — conform `useActionState` 統合経路。
 *
 * Phase 1 Task 6 conform 移行で `useFormAction` (RHF) から
 * `useActionState` + `useForm` (conform) に clean break 移行。
 * UI 側は `contactInfoFormSchema` (空文字許容)、domain 側は
 * `contactInfoSchema` (nullable) を使い分け、executor 内で `emptyToNull` で
 * "" → null 変換する。
 */
export async function updateContactInfo(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    contactInfoFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await updateContactInfoCommand({
            phoneNumber: emptyToNull(data.phoneNumber),
            faxNumber: emptyToNull(data.faxNumber),
            email: emptyToNull(data.email),
            postalCode: emptyToNull(data.postalCode),
            prefecture: emptyToNull(data.prefecture),
            city: emptyToNull(data.city),
            streetAddress: emptyToNull(data.streetAddress),
            buildingName: emptyToNull(data.buildingName),
          });
          return null;
        },
        afterSuccess: () => {
          updateTag(CACHE_TAGS.ORGANIZATION_SETTINGS);
          updateTag(CACHE_TAGS.BUSINESS_SETTINGS);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
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
    afterSuccess: () => {
      updateTag(CACHE_TAGS.BUSINESS_SETTINGS);
      updateTag(CACHE_TAGS.RESERVATIONS);
    },
  });
}
