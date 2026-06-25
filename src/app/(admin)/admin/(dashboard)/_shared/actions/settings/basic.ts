"use server";

/**
 * 基本情報・レイアウト・SEO設定 Server Actions
 *
 * @module admin/actions/settings/basic
 */

import type { SubmissionResult } from "@conform-to/react";
import { invalidateSiteWideCache } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  updateBasicInfo as updateBasicInfoCommand,
  updateLayoutSettings as updateLayoutSettingsCommand,
  updateMetaSettings as updateMetaSettingsCommand,
  updateAnalyticsSettings as updateAnalyticsSettingsCommand,
  updateSearchVerification as updateSearchVerificationCommand,
} from "@/shared/domain/settings/commands";

import { basicInfoFormSchema } from "./schemas/form-schemas-brand-contact";
import { layoutFormSchema } from "./schemas/form-schemas-privacy-appearance";
import {
  metaFormSchema,
  analyticsFormSchema,
  searchVerificationFormSchema,
} from "./schemas/form-schemas-seo-analytics";
import { emptyToNull } from "./schemas/form-schema-helpers";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import { isValidAnalyticsType } from "@/shared/lib/validations/enums/guards";

/**
 * 基本情報更新 — conform `useActionState` 統合経路。
 *
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
          // faviconUrl は NOT NULL + DEFAULT '' で型強化済（null は許さない）。
          // conform の parseWithZod は空入力を undefined にするため `?? ""` で空文字化。
          faviconUrl: data.faviconUrl ?? "",
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
        invalidateSiteWideCache(CACHE_TAGS.LAYOUT_SETTINGS);
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
              ? parseInt(data.containerWidthCustom ?? "", 10) || null
              : null,
          contentWidth: data.contentWidth,
          contentWidthCustom:
            data.contentWidth === LayoutWidth.CUSTOM
              ? parseInt(data.contentWidthCustom ?? "", 10) || null
              : null,
        });
        return null;
      },
      afterSuccess: () => {
        invalidateSiteWideCache(CACHE_TAGS.LAYOUT_SETTINGS);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * メタ情報設定更新 — conform `useActionState` 統合経路。
 */
export async function updateMetaSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, metaFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await updateMetaSettingsCommand({
          defaultMetaDescription: emptyToNull(data.defaultMetaDescription),
          defaultMetaKeywords: emptyToNull(data.defaultMetaKeywords),
          defaultOgpTitle: emptyToNull(data.defaultOgpTitle),
          defaultOgpDescription: emptyToNull(data.defaultOgpDescription),
        });
        return null;
      },
      afterSuccess: () => {
        invalidateSiteWideCache(CACHE_TAGS.SEO_SETTINGS);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * Analytics 設定更新 — conform `useActionState` 統合経路。
 *
 * analyticsType: フォームでは "none" を含む union (conform 経由) で受け、
 * domain command 渡し時に "none" → null に変換。
 */
export async function updateAnalyticsSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, analyticsFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await updateAnalyticsSettingsCommand({
          // isValidAnalyticsType は type guard `value is AnalyticsType` のため
          // narrow 後の cast は不要
          analyticsType:
            data.analyticsType !== "none" &&
            isValidAnalyticsType(data.analyticsType)
              ? data.analyticsType
              : null,
          googleAnalyticsId: emptyToNull(data.googleAnalyticsId),
          googleTagManagerId: emptyToNull(data.googleTagManagerId),
          gaPropertyId: emptyToNull(data.gaPropertyId),
          microsoftClarityId: emptyToNull(data.microsoftClarityId),
        });
        return null;
      },
      afterSuccess: () => {
        invalidateSiteWideCache(CACHE_TAGS.ANALYTICS_CONFIG);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * 検索エンジン検証設定更新 — conform `useActionState` 統合経路。
 */
export async function updateSearchVerification(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    searchVerificationFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await updateSearchVerificationCommand({
            googleSearchConsoleId: emptyToNull(data.googleSearchConsoleId),
            bingWebmasterToolsId: emptyToNull(data.bingWebmasterToolsId),
          });
          return null;
        },
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.SEO_SETTINGS);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}
