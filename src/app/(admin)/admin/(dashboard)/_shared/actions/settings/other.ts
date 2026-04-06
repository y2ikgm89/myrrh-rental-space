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
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import * as announcementBarCommands from "@/shared/domain/settings/announcement-bar";
import * as settingsCommands from "@/shared/domain/settings/commands";

import { sidebarSettingsSchema } from "@/shared/lib/validations/sidebar";
import {
  maintenanceSettingsSchema,
  cookieConsentSettingsSchema,
  reservationSettingsSchema,
  announcementBarCarouselSettingsSchema,
  permalinkSettingsSchema,
  headerSettingsSchema,
  footerSettingsSchema,
  type MaintenanceSettingsInput,
  type CookieConsentSettingsInput,
  type ReservationSettingsInput,
  type AnnouncementBarCarouselSettingsInput,
  type PermalinkSettingsInput,
  type HeaderSettingsInput,
  type FooterSettingsInput,
  type SidebarSettingsInput,
} from "./schemas";

export async function updateMaintenanceSettings(
  data: MaintenanceSettingsInput,
): Promise<MutationResult> {
  const parsed = maintenanceSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateMaintenanceSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.LAYOUT_SETTINGS);
    },
  });
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
  data: SidebarSettingsInput,
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
