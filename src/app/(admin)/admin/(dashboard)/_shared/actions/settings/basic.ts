"use server";

/**
 * 基本情報・レイアウト・SEO設定 Server Actions
 *
 * @module admin/actions/settings/basic
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
  updateBasicInfo as updateBasicInfoCommand,
  updateLayoutSettings as updateLayoutSettingsCommand,
  updateMetaSettings as updateMetaSettingsCommand,
  updateAnalyticsSettings as updateAnalyticsSettingsCommand,
  updateSearchVerification as updateSearchVerificationCommand,
} from "@/shared/domain/settings/commands";

import {
  metaSettingsSchema,
  analyticsSettingsSchema,
  searchVerificationSchema,
  type MetaSettingsInput,
  type AnalyticsSettingsInput,
  type SearchVerificationInput,
} from "./schemas";
import { basicInfoFormSchema } from "./schemas/form-schemas-brand-contact";
import { layoutFormSchema } from "./schemas/form-schemas-privacy-appearance";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";

function emptyToNull(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * 基本情報更新 — conform `useActionState` 統合経路。
 *
 * Phase 1 Task 6 conform 移行で `useFormAction` (RHF) から
 * `useActionState` + `useForm` (conform) に clean break 移行。
 * テキスト 3 件 + MediaPicker 4 件 + Switch 2 件を 1 保存単位で扱う。
 */
export async function updateBasicInfo(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, basicInfoFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await updateBasicInfoCommand({
          siteName: emptyToNull(data.siteName),
          siteDescription: emptyToNull(data.siteDescription),
          faviconUrl: emptyToNull(data.faviconUrl),
          defaultOgpImageUrl: emptyToNull(data.defaultOgpImageUrl),
          headerLogoUrl: emptyToNull(data.headerLogoUrl),
          footerLogoUrl: emptyToNull(data.footerLogoUrl),
          footerCopyright: emptyToNull(data.footerCopyright),
          useHeaderLogo: data.useHeaderLogo,
          useFooterLogo: data.useFooterLogo,
        });
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.LAYOUT_SETTINGS);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * レイアウト設定更新 — conform `useActionState` 統合経路。
 *
 * Phase 1 Task 6 conform 移行で `useFormAction` (RHF) から
 * `useActionState` + `useForm` (conform) に clean break 移行。
 * containerWidth / contentWidth は LayoutWidth enum、custom 値は
 * string で受け取り CUSTOM の場合のみ parseInt して domain に渡す。
 */
export async function updateLayoutSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, layoutFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await updateLayoutSettingsCommand({
          containerWidth: data.containerWidth,
          containerWidthCustom:
            data.containerWidth === LayoutWidth.CUSTOM
              ? parseInt(data.containerWidthCustom, 10) || null
              : null,
          contentWidth: data.contentWidth,
          contentWidthCustom:
            data.contentWidth === LayoutWidth.CUSTOM
              ? parseInt(data.contentWidthCustom, 10) || null
              : null,
        });
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.LAYOUT_SETTINGS);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

export async function updateMetaSettings(
  data: MetaSettingsInput,
): Promise<MutationResult> {
  const parsed = metaSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateMetaSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SEO_SETTINGS);
    },
  });
}

export async function updateAnalyticsSettings(
  data: AnalyticsSettingsInput,
): Promise<MutationResult> {
  const parsed = analyticsSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateAnalyticsSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ANALYTICS_CONFIG);
    },
  });
}

export async function updateSearchVerification(
  data: SearchVerificationInput,
): Promise<MutationResult> {
  const parsed = searchVerificationSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateSearchVerificationCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SEO_SETTINGS);
    },
  });
}
