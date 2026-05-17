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
  contactInfoFormSchema,
  businessHoursSettingsSchema,
  type BusinessHoursSettingsInput,
} from "./schemas";
import { businessInfoFormSchema } from "./schemas/form-schemas-brand-contact";

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

/**
 * 事業者情報更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 * 7 文字列 + 1 日付 + 1 textarea + 2 Select を 1 保存単位で扱う。
 */
export async function updateBusinessInfo(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    businessInfoFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await updateBusinessInfoCommand({
            businessName: emptyToNull(data.businessName),
            businessNameKana: emptyToNull(data.businessNameKana),
            representativeName: emptyToNull(data.representativeName),
            businessType: emptyToNull(data.businessType),
            industryType: emptyToNull(data.industryType),
            establishedDate: data.establishedDate || null,
            registrationNumber: emptyToNull(data.registrationNumber),
            invoiceNumber: emptyToNull(data.invoiceNumber),
            businessDescription: emptyToNull(data.businessDescription),
          });
          return null;
        },
        afterSuccess: () => {
          updateTag(CACHE_TAGS.ORGANIZATION_SETTINGS);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}

/**
 * 連絡先情報更新 — conform `useActionState` 統合経路。
 *
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
