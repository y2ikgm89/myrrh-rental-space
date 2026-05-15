"use server";

/**
 * その他の設定 Server Actions
 * - メンテナンス設定
 * - Cookie同意設定
 * - 予約設定
 * - サイドバー設定
 * - お知らせバーカルーセル設定
 *
 * @module admin/actions/settings/other
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import * as announcementBarCommands from "@/shared/domain/settings/announcement-bar";
import * as settingsCommands from "@/shared/domain/settings/commands";

import {
  sidebarSettingsSchema,
  type SidebarSettings,
} from "@/shared/lib/validations/sidebar";
import {
  maintenanceSettingsSchema,
  cookieConsentSettingsSchema,
  reservationSettingsSchema,
  announcementBarCarouselSettingsSchema,
  permalinkSettingsSchema,
  headerSettingsSchema,
  footerSettingsSchema,
  featureModulesSettingsSchema,
  type CookieConsentSettingsInput,
  type ReservationSettingsInput,
  type AnnouncementBarCarouselSettingsInput,
  type PermalinkSettingsInput,
  type HeaderSettingsInput,
  type FooterSettingsInput,
  type FeatureModulesSettingsInput,
} from "./schemas";

/**
 * メンテナンス設定の更新 — conform `useActionState` 統合経路。
 *
 * Phase 1 Task 5 conform 移行で `useFormAction` (RHF) から
 * `useActionState` + `useForm` (conform) に clean break 移行。
 * 認証・権限・監査ログは `executeAdminMutationResult` SSoT に委譲する。
 */
export async function updateMaintenanceSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    maintenanceSettingsSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await settingsCommands.updateMaintenanceSettings(data);
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
    },
  );
}

export async function updateCookieConsentSettings(
  data: CookieConsentSettingsInput,
): Promise<MutationResult> {
  const parsed = cookieConsentSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateCookieConsentSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.COOKIE_CONSENT);
    },
  });
}

export async function updateReservationSettings(
  data: ReservationSettingsInput,
): Promise<MutationResult> {
  const parsed = reservationSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateReservationSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.BUSINESS_SETTINGS);
      updateTag(CACHE_TAGS.TERMS);
    },
  });
}

export async function updateSidebarSettings(
  data: SidebarSettings,
): Promise<MutationResult> {
  const parsed = sidebarSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateSidebarSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SIDEBAR_SETTINGS);
      updateTag(CACHE_TAGS.SIDEBAR_DATA);
      updateTag(CACHE_TAGS.POSTS);
    },
  });
}

export async function updateAnnouncementBarCarouselSettings(
  data: AnnouncementBarCarouselSettingsInput,
): Promise<MutationResult> {
  const parsed = announcementBarCarouselSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await announcementBarCommands.updateAnnouncementBarCarouselSettings(
        parsed.data,
      );
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.ANNOUNCEMENT_BAR);
    },
  });
}

export async function updatePermalinkSettings(
  data: PermalinkSettingsInput,
): Promise<MutationResult> {
  const parsed = permalinkSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updatePermalinkSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.PERMALINK);
      updateTag(CACHE_TAGS.POSTS);
      updateTag(CACHE_TAGS.SIDEBAR_DATA);
    },
  });
}

export async function updateHeaderSettings(
  data: HeaderSettingsInput,
): Promise<MutationResult> {
  const parsed = headerSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateHeaderSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LAYOUT_SETTINGS);
    },
  });
}

export async function updateFooterSettings(
  data: FooterSettingsInput,
): Promise<MutationResult> {
  const parsed = footerSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateFooterSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LAYOUT_SETTINGS);
      updateTag(CACHE_TAGS.SOCIAL_LINKS);
    },
  });
}

/**
 * Feature Module ON/OFF map を更新する。
 *
 * 影響範囲: 公開ページ 404 ガード（page.tsx）/ navigation prune /
 * sitemap prune / SectionRenderer skip / cron 早期 return。
 * cache invalidation は影響範囲に応じて広範囲に実行する必要がある。
 */
export async function updateFeatureModulesSettings(
  data: FeatureModulesSettingsInput,
): Promise<MutationResult> {
  const parsed = featureModulesSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateFeatureModulesCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      // FEATURE_MODULES SSoT 自体
      updateTag(CACHE_TAGS.FEATURE_MODULES);
      // Phase 3 で feature filter を埋め込んだ全 consumer を invalidate
      updateTag(CACHE_TAGS.NAVIGATION);
      updateTag(CACHE_TAGS.PAGE_SECTIONS);
      updateTag(CACHE_TAGS.SECTIONS);
      // sitemap 生成は dynamic で feature filter を毎回読むため明示 invalidate 不要だが、
      // Cloud CDN にキャッシュされている可能性があるため明示する
      updateTag(CACHE_TAGS.PAGES);
      updateTag(CACHE_TAGS.REVIEWS);
    },
  });
}
