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

import type { SubmissionResult } from "@conform-to/react";
import { invalidateSiteWideCache } from "@/shared/lib/cache";
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
  reservationSettingsSchema,
  announcementBarCarouselSettingsSchema,
  headerSettingsSchema,
  featureModulesSettingsSchema,
  type AnnouncementBarCarouselSettingsInput,
} from "./schemas";
import { emptyToNull } from "./schemas/form-schema-helpers";
import { maintenanceFormSchema } from "./schemas/form-schemas-brand-contact";
import {
  cookieConsentFormSchema,
  footerFormSchema,
} from "./schemas/form-schemas-privacy-appearance";

/**
 * メンテナンス設定の更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 * 認証・権限・監査ログは `executeAdminMutationResult` SSoT に委譲する。
 */
export async function updateMaintenanceSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    maintenanceFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await settingsCommands.updateMaintenanceSettings({
            maintenanceMode: data.maintenanceMode,
            maintenanceMessage: emptyToNull(data.maintenanceMessage),
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
    },
  );
}

/**
 * Cookie 同意設定の更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function updateCookieConsentSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    cookieConsentFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await settingsCommands.updateCookieConsentSettings({
            cookieConsentEnabled: data.cookieConsentEnabled,
            cookieConsentMessage: emptyToNull(data.cookieConsentMessage),
            cookieConsentAcceptText: emptyToNull(data.cookieConsentAcceptText),
            cookieConsentRejectText: emptyToNull(data.cookieConsentRejectText),
            cookieConsentPolicyUrl: emptyToNull(data.cookieConsentPolicyUrl),
          });
          return null;
        },
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.COOKIE_CONSENT);
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
 * 予約設定の更新 — conform `useActionState` 統合経路。
 */
export async function updateReservationSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    reservationSettingsSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await settingsCommands.updateReservationSettings(data);
          return null;
        },
        afterSuccess: () => {
          invalidateSiteWideCache([
            CACHE_TAGS.BUSINESS_SETTINGS,
            CACHE_TAGS.TERMS,
          ]);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
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
      // SIDEBAR_* are read by BlogLayout consumers: /blog archive, taxonomy archives,
      // ArticleLayout-wrapped /blog/[slug], /news/[id], /events/[slug], /terms.
      // POSTS is defensive — sidebar widgets (recent/popular) derive from Post rows.
      invalidateSiteWideCache([
        CACHE_TAGS.SIDEBAR_SETTINGS,
        CACHE_TAGS.SIDEBAR_DATA,
        CACHE_TAGS.POSTS,
      ]);
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
      invalidateSiteWideCache(CACHE_TAGS.ANNOUNCEMENT_BAR);
    },
  });
}

/**
 * ヘッダー設定の更新 — conform `useActionState` 統合経路。
 */
export async function updateHeaderSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    headerSettingsSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await settingsCommands.updateHeaderSettings(data);
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
    },
  );
}

/**
 * フッター設定の更新 — conform `useActionState` 統合経路。
 */
export async function updateFooterSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, footerFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await settingsCommands.updateFooterSettings({
          footerTagline: emptyToNull(data.footerTagline),
          footerNavigationLabel: data.footerNavigationLabel,
          footerContactLabel: data.footerContactLabel,
          footerHoursLabel: data.footerHoursLabel,
          footerShowSocialLinks: data.footerShowSocialLinks,
          themeColor: data.themeColor,
        });
        return null;
      },
      afterSuccess: () => {
        invalidateSiteWideCache([
          CACHE_TAGS.LAYOUT_SETTINGS,
          CACHE_TAGS.SOCIAL_LINKS,
        ]);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * Feature Module ON/OFF map を更新する — conform `useActionState` 統合経路。
 *
 * 影響範囲: 公開ページ 404 ガード（page.tsx）/ navigation prune /
 * sitemap prune / SectionRenderer skip / cron 早期 return。
 * cache invalidation は影響範囲に応じて広範囲に実行する必要がある。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function updateFeatureModulesSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    featureModulesSettingsSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          await settingsCommands.updateFeatureModulesCommand(data);
          return null;
        },
        afterSuccess: () => {
          invalidateSiteWideCache([
            // FEATURE_MODULES SSoT 自体
            CACHE_TAGS.FEATURE_MODULES,
            // feature filter を埋め込んだ全 consumer を invalidate
            CACHE_TAGS.NAVIGATION,
            CACHE_TAGS.PAGE_SECTIONS,
            CACHE_TAGS.SECTIONS,
            // sitemap 生成は dynamic で feature filter を毎回読むため明示
            // invalidate 不要だが、Cloud CDN にキャッシュされている可能性が
            // あるため明示する
            CACHE_TAGS.PAGES,
            CACHE_TAGS.REVIEWS,
          ]);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}
